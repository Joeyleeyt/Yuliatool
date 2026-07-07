import {
  AssetKind,
  ProjectStatus,
  QueueName,
  SceneVisualType,
  NotFoundError,
  ValidationError,
} from '@yulia/core';
import type { ProjectRow, SceneRow } from '@yulia/db';
import type { AppContext } from '../context.js';

interface Dispatch {
  queue: QueueName;
  payload: Record<string, string>;
  target: { projectId: string; sceneId?: string | null };
}

interface ResumePlan {
  status: ProjectStatus;
  dispatches: Dispatch[];
}

/** Active (non-terminal, work-in-progress) statuses eligible for recovery scan. */
const ACTIVE_STATUSES: ProjectStatus[] = [
  ProjectStatus.TRANSCRIBING,
  ProjectStatus.ANALYZING,
  ProjectStatus.SEGMENTING,
  ProjectStatus.PROMPT_GENERATION,
  ProjectStatus.VIDEO_GENERATION,
  ProjectStatus.IMAGE_GENERATION,
  ProjectStatus.WAITING_ASSETS,
  ProjectStatus.RENDERING,
];

/**
 * Derives, from persisted state alone, exactly what work a project still needs
 * and re-dispatches it (force). Used for:
 *   - boot recovery (`reconcileActive`) after a Fly restart / worker crash, and
 *   - the user "retry" action on a FAILED project.
 * Idempotent handlers make re-dispatch safe even if the work was actually done.
 */
export class RecoveryService {
  constructor(private readonly ctx: AppContext) {}

  /** Re-plan a single project and dispatch its outstanding work. */
  async resume(projectId: string): Promise<ProjectStatus> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const plan = await this.plan(project);

    await this.ctx.repos.projects.applyStatus(projectId, {
      status: plan.status,
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    });
    await this.ctx.repos.activity.log({
      projectId,
      type: 'resumed',
      message: `Resumed at ${plan.status}`,
      data: { dispatched: plan.dispatches.length },
    });

    for (const d of plan.dispatches) {
      await this.ctx.jobs.dispatch(d.queue, d.payload as never, d.target, { force: true });
    }
    this.ctx.logger.info(
      { projectId, status: plan.status, dispatched: plan.dispatches.length },
      'project resumed',
    );
    return plan.status;
  }

  /** Boot recovery: resume every active project. Returns how many were resumed. */
  async reconcileActive(): Promise<number> {
    const projects = await this.ctx.repos.projects.listByStatuses(ACTIVE_STATUSES);
    let resumed = 0;
    for (const p of projects) {
      try {
        await this.resume(p.id);
        resumed++;
      } catch (err) {
        this.ctx.logger.error({ err, projectId: p.id }, 'recovery resume failed');
      }
    }
    if (projects.length > 0) this.ctx.logger.info({ resumed }, 'boot recovery complete');
    return resumed;
  }

  /**
   * Inspect what artifacts exist and choose the earliest incomplete stage. This
   * is the single source of truth for "where should this project continue".
   */
  private async plan(project: ProjectRow): Promise<ResumePlan> {
    const projectId = project.id;

    const voiceover = (await this.ctx.repos.assets.findByProject(projectId, AssetKind.VOICEOVER)).find(
      (a) => a.status === 'stored',
    );
    if (!voiceover) {
      // No audio yet — nothing to resume automatically.
      throw new ValidationError('No stored voiceover; cannot resume', { projectId });
    }

    const transcript = await this.ctx.repos.transcripts.findByProject(projectId);
    if (!transcript) {
      return {
        status: ProjectStatus.TRANSCRIBING,
        dispatches: [
          {
            queue: QueueName.TRANSCRIPTION,
            payload: { projectId, assetId: voiceover.id },
            target: { projectId },
          },
        ],
      };
    }

    const scenes = await this.ctx.repos.scenes.listByProject(projectId);
    const analysis = await this.ctx.repos.analyses.findByProject(projectId);
    if (!analysis || scenes.length === 0) {
      return {
        status: ProjectStatus.ANALYZING,
        dispatches: [
          { queue: QueueName.SCRIPT_ANALYSIS, payload: { projectId }, target: { projectId } },
        ],
      };
    }

    const activePrompts = await this.ctx.repos.prompts.countActiveByProject(projectId);
    if (activePrompts < scenes.length) {
      return {
        status: ProjectStatus.PROMPT_GENERATION,
        dispatches: [
          { queue: QueueName.PROMPT_GENERATION, payload: { projectId }, target: { projectId } },
        ],
      };
    }

    const pending = scenes.filter((s) => s.status !== 'stored');
    if (pending.length > 0) {
      return {
        status: ProjectStatus.VIDEO_GENERATION,
        dispatches: pending.map((scene) => this.generationDispatch(projectId, scene)),
      };
    }

    // All assets present -> (re)render.
    const existing = await this.ctx.repos.renders.findLatestByProject(projectId);
    const render =
      existing && existing.status !== 'completed'
        ? existing
        : await this.ctx.repos.renders.create({ projectId, format: project.render_format });
    return {
      status: ProjectStatus.RENDERING,
      dispatches: [
        {
          queue: QueueName.RENDERING,
          payload: { projectId, renderId: render.id },
          target: { projectId },
        },
      ],
    };
  }

  private generationDispatch(projectId: string, scene: SceneRow): Dispatch {
    const isVideo = scene.visual_type === SceneVisualType.VIDEO;
    return {
      queue: isVideo ? QueueName.VIDEO_GENERATION : QueueName.IMAGE_GENERATION,
      payload: { projectId, sceneId: scene.id },
      target: { projectId, sceneId: scene.id },
    };
  }
}
