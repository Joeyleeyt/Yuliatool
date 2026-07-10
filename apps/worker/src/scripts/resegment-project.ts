/**
 * Re-segment an existing project from scratch with the CURRENT segmentation
 * cadence (see @yulia/core SEGMENT_WINDOW_SEC / SEGMENT_WINDOW_BY_BEAT), then let
 * the pipeline regenerate everything downstream.
 *
 * DESTRUCTIVE: re-running analysis replaces the project's scenes
 * (SceneRepository.replaceForProject deletes + reinserts), and because
 * `assets.scene_id` is ON DELETE CASCADE, every previously-generated background
 * and overlay for those scenes is deleted too. All assets are REGENERATED from
 * scratch (full 69Labs cost + time). Use this only when you deliberately want a
 * project re-cut to the new pacing — not to recover a stuck project (use
 * `recover` for that, which reuses existing assets).
 *
 * Forces the project back to ANALYZING (bypassing the forward-only state
 * machine, by design for this maintenance op) and dispatches the analysis stage;
 * AnalysisService re-analyzes, re-segments, and fans out generation as usual.
 * The DB trigger `trg_scenes_sync_counts` resets `completed_scenes` when the old
 * scenes are deleted, so fan-in stays correct.
 *
 * Usage (from repo root):
 *   pnpm --filter @yulia/worker resegment -- <projectId>
 *
 * A worker must be running (or started afterwards) to process the re-dispatched
 * work.
 */
import { ProjectStatus, QueueName, createLogger } from '@yulia/core';
import { closeDb } from '@yulia/db';
import { closeRedis } from '@yulia/services';
import { closeQueues } from '@yulia/queue';
import { createAppContext } from '@yulia/domain';

const log = createLogger({ component: 'resegment-project' });

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId) {
    log.error('missing projectId. usage: resegment-project <projectId>');
    process.exitCode = 1;
    return;
  }

  const ctx = createAppContext();
  try {
    const project = await ctx.repos.projects.findById(projectId);
    if (!project) {
      log.error({ projectId }, 'project not found');
      process.exitCode = 1;
      return;
    }

    // A transcript is the input to analysis; without it there is nothing to
    // re-segment.
    const transcript = await ctx.repos.transcripts.findByProject(projectId);
    if (!transcript?.full_text) {
      log.error({ projectId }, 'no transcript; cannot re-segment');
      process.exitCode = 1;
      return;
    }

    log.warn(
      { projectId, fromStatus: project.status },
      're-segmenting: existing scenes + their generated assets will be DELETED and regenerated',
    );

    // Force back to ANALYZING (forward-only state machine forbids this jump, so
    // we write status directly) and clear any prior failure.
    await ctx.repos.projects.applyStatus(projectId, {
      status: ProjectStatus.ANALYZING,
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    });
    await ctx.repos.activity.log({
      projectId,
      type: 'resegmented',
      message: 'Project reset to ANALYZING for re-segmentation (new cadence)',
      data: { fromStatus: project.status },
    });

    // Re-dispatch the analysis stage (force past the idempotency ledger).
    await ctx.jobs.dispatch(
      QueueName.SCRIPT_ANALYSIS,
      { projectId },
      { projectId },
      { force: true },
    );

    log.info(
      { projectId },
      're-segmentation dispatched — start/keep the worker running to process it',
    );
  } finally {
    await closeQueues();
    await closeRedis();
    await closeDb();
  }
}

main().catch((err) => {
  log.error({ err }, 're-segmentation failed');
  process.exit(1);
});
