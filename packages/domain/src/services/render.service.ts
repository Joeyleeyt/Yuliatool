import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  AssetKind,
  ProjectStatus,
  overlaySide,
  mapLimit,
  NotFoundError,
  ValidationError,
  R2_PREFIX,
  RENDER_DIMENSIONS,
  RENDER_ENCODING,
  env,
} from '@yulia/core';
import type { SceneRow, Json } from '@yulia/db';
import { renderVideo, type RenderSegment } from '@yulia/ffmpeg';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

const SCRATCH_ROOT = process.env.SCRATCH_DIR ?? join(tmpdir(), 'yulia-render');
/** Never let a crossfade exceed a segment; floor the on-screen duration. */
const MIN_SEGMENT_SEC = 0.7;

/**
 * RENDERING stage. Downloads every stored asset + the voiceover to a scratch
 * dir, runs the FFmpeg pipeline, uploads the MP4 to R2, and completes the
 * project. Idempotent: a completed render short-circuits; scratch is always
 * cleaned up.
 */
export class RenderService {
  private readonly projects: ProjectService;

  constructor(private readonly ctx: AppContext) {
    this.projects = new ProjectService(ctx);
  }

  async run(projectId: string, renderId: string): Promise<void> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const render = await this.ctx.repos.renders.findById(renderId);
    if (!render) throw new NotFoundError('Render', renderId);
    if (render.status === 'completed') return;
    if (project.status !== ProjectStatus.RENDERING) {
      this.ctx.logger.info({ projectId, status: project.status }, 'render skipped (wrong state)');
      return;
    }

    const scenes = await this.ctx.repos.scenes.listByProject(projectId);
    if (scenes.length === 0) throw new ValidationError('No scenes to render', { projectId });

    const voiceover = (await this.ctx.repos.assets.findByProject(projectId, AssetKind.VOICEOVER)).find(
      (a) => a.status === 'stored' && a.r2_key,
    );
    if (!voiceover?.r2_key) throw new ValidationError('No stored voiceover', { projectId });

    const transcript = await this.ctx.repos.transcripts.findByProject(projectId);
    const audioDurationSec =
      transcript?.duration_sec ?? scenes[scenes.length - 1]!.end_sec;

    const { width, height } = RENDER_DIMENSIONS[project.render_format];
    const workDir = join(SCRATCH_ROOT, projectId, renderId);

    try {
      await mkdir(workDir, { recursive: true });
      await this.ctx.repos.renders.update(renderId, {
        status: 'downloading_assets',
        startedAt: new Date().toISOString(),
        progress: 2,
      });

      // Download voiceover + each scene asset locally.
      this.ctx.logger.info(
        { projectId, renderId, scenes: scenes.length },
        'render: downloading voiceover + scene assets',
      );
      const voicePath = join(workDir, 'voiceover');
      await this.download(voiceover.r2_key, voicePath);

      const segments = await this.buildSegments(scenes, audioDurationSec, workDir);

      await this.ctx.repos.renders.update(renderId, { status: 'normalizing', progress: 10 });

      this.ctx.logger.info(
        { projectId, renderId, segments: segments.length, width, height },
        'render: encoding video (ffmpeg)',
      );
      const outputPath = join(workDir, 'final.mp4');
      let lastPersisted = 10;
      const result = await renderVideo({
        segments,
        voiceoverPath: voicePath,
        outputPath,
        width,
        height,
        workDir,
        onProgress: (p) => {
          // Map pipeline 0..100 onto 10..90; throttle DB writes to ~5% steps.
          const overall = 10 + Math.round(p.percent * 0.8);
          if (overall - lastPersisted >= 5) {
            lastPersisted = overall;
            // Fire-and-forget: a dropped progress write is cosmetic. Swallow
            // errors so a transient DB blip can't reject an unawaited promise
            // and crash the worker (the render itself still succeeds/fails on
            // its own awaited writes).
            void this.ctx.repos.renders
              .update(renderId, {
                progress: overall,
                status: p.stage === 'mux' ? 'muxing' : 'concatenating',
              })
              .catch((err: unknown) =>
                this.ctx.logger.warn({ err, renderId, overall }, 'render progress write failed (ignored)'),
              );
          }
        },
      });

      // Upload the final MP4 to R2 (streamed, not buffered).
      await this.ctx.repos.renders.update(renderId, { status: 'uploading', progress: 92 });
      const renderKey = R2_PREFIX.render(projectId, renderId);
      const { size } = await stat(outputPath);
      this.ctx.logger.info(
        { projectId, renderId, bytes: size, durationSec: result.durationSec },
        'render: uploading final MP4 to R2',
      );
      await this.ctx.storage.putObject(renderKey, createReadStream(outputPath), {
        contentType: 'video/mp4',
        contentLength: size,
      });

      const asset = await this.ctx.repos.assets.create({
        projectId,
        kind: AssetKind.RENDER,
        status: 'stored',
        contentType: 'video/mp4',
        r2Bucket: env.R2_BUCKET,
        r2Key: renderKey,
      });
      await this.ctx.repos.assets.markStored(asset.id, {
        r2Bucket: env.R2_BUCKET,
        r2Key: renderKey,
        contentType: 'video/mp4',
        sizeBytes: size,
        width,
        height,
        durationSec: result.durationSec,
      });

      await this.ctx.repos.renders.update(renderId, {
        status: 'completed',
        progress: 100,
        assetId: asset.id,
        durationSec: result.durationSec,
        fps: RENDER_ENCODING.fps,
        completedAt: new Date().toISOString(),
      });

      await this.projects.transition(projectId, ProjectStatus.COMPLETED);
      await this.ctx.repos.activity.log({
        projectId,
        type: 'render_completed',
        message: 'Final video rendered',
        data: { renderId, key: renderKey, durationSec: result.durationSec } as unknown as Json,
      });

      this.ctx.logger.info({ projectId, renderId, key: renderKey }, 'render complete');
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async buildSegments(
    scenes: SceneRow[],
    audioDurationSec: number,
    workDir: string,
  ): Promise<RenderSegment[]> {
    // Stage every scene's two layers concurrently (bounded) instead of scene-by-
    // scene serial DB lookups + R2 GETs — this is pure I/O dead time at the head
    // of the render. Order is preserved so segments line up with the timeline.
    return mapLimit(scenes, env.RENDER_DOWNLOAD_CONCURRENCY, async (scene, i) => {
      const pad = String(i).padStart(4, '0');

      // Each scene has two layers: a background video + an overlay image.
      const [bg, overlay] = await Promise.all([
        this.ctx.repos.assets.findBySceneAndKind(scene.id, AssetKind.VIDEO_CLIP),
        this.ctx.repos.assets.findBySceneAndKind(scene.id, AssetKind.IMAGE),
      ]);
      if (!bg?.r2_key) throw new ValidationError('Scene background missing', { sceneId: scene.id });
      if (!overlay?.r2_key) throw new ValidationError('Scene overlay missing', { sceneId: scene.id });

      const backgroundPath = join(workDir, `bg_${pad}`);
      const overlayPath = join(workDir, `ov_${pad}`);
      await Promise.all([
        this.download(bg.r2_key, backgroundPath),
        this.download(overlay.r2_key, overlayPath),
      ]);

      // Tile the timeline by scene start times so inter-scene pauses are covered
      // and video length matches the continuous voiceover.
      const next = scenes[i + 1];
      const displayEnd = next ? next.start_sec : audioDurationSec;
      const displayDurationSec = Math.max(MIN_SEGMENT_SEC, displayEnd - scene.start_sec);

      return {
        backgroundPath,
        overlayPath,
        overlaySide: overlaySide(scene.scene_index),
        displayDurationSec,
      };
    });
  }

  private async download(key: string, dest: string): Promise<void> {
    const stream = await this.ctx.storage.getObjectStream(key);
    await pipeline(stream, createWriteStream(dest));
  }
}
