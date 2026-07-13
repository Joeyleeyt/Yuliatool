import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  AssetKind,
  ProjectStatus,
  mapLimit,
  NotFoundError,
  ValidationError,
  R2_PREFIX,
  RENDER_DIMENSIONS,
  RENDER_ENCODING,
  env,
} from '@yulia/core';
import type { SceneRow, Json } from '@yulia/db';
import { compositeSegment, concatAndMux, type RenderSegment } from '@yulia/ffmpeg';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

const SCRATCH_ROOT = process.env.SCRATCH_DIR ?? join(tmpdir(), 'yulia-render');
/** Never let a crossfade exceed a segment; floor the on-screen duration. */
const MIN_SEGMENT_SEC = 0.7;

/** A gallery still's rotation slot, persisted in the asset's metadata. */
function slotOf(asset: { metadata: Json }): number {
  const m = asset.metadata as { slot?: number } | null;
  return typeof m?.slot === 'number' ? m.slot : 0;
}

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

      // Download the voiceover locally (needed up front for the final mux).
      this.ctx.logger.info(
        { projectId, renderId, scenes: scenes.length },
        'render: downloading voiceover, then staging + compositing scenes',
      );
      const voicePath = join(workDir, 'voiceover');
      await this.download(voiceover.r2_key, voicePath);

      // Global background music: one fixed R2 object shared by every render. If
      // it's present, download it and mix it under the voiceover; if it's absent
      // (never uploaded), render voiceover-only — the music is optional, never a
      // hard dependency, so a missing track must not fail the project.
      const musicPath = await this.tryDownloadMusic(workDir);

      await this.ctx.repos.renders.update(renderId, { status: 'normalizing', progress: 10 });

      // Download each scene's assets AND composite it in one pooled pass, so
      // scene N starts compositing the moment its own download lands instead
      // of waiting for every scene in the project to finish downloading first
      // (the old two-phase download-all-then-composite-all order left the
      // composite pool's CPU idle for the whole download phase).
      this.ctx.logger.info(
        { projectId, renderId, scenes: scenes.length, width, height },
        'render: staging + encoding video (ffmpeg)',
      );
      const outputPath = join(workDir, 'final.mp4');
      let lastPersisted = 10;
      const reportProgress = (percent: number, stage: 'normalize' | 'concat' | 'mux') => {
        // Map pipeline 0..100 onto 10..90; throttle DB writes to ~5% steps.
        const overall = 10 + Math.round(percent * 0.8);
        if (overall - lastPersisted >= 5) {
          lastPersisted = overall;
          // Fire-and-forget: a dropped progress write is cosmetic. Swallow
          // errors so a transient DB blip can't reject an unawaited promise
          // and crash the worker (the render itself still succeeds/fails on
          // its own awaited writes).
          void this.ctx.repos.renders
            .update(renderId, {
              progress: overall,
              status: stage === 'mux' ? 'muxing' : 'concatenating',
            })
            .catch((err: unknown) =>
              this.ctx.logger.warn({ err, renderId, overall }, 'render progress write failed (ignored)'),
            );
        }
      };

      const { normalized, displayDurations } = await this.stageAndCompositeSegments(
        scenes,
        audioDurationSec,
        workDir,
        width,
        height,
        (done, total) => reportProgress(Math.round((done / total) * 70), 'normalize'),
      );

      const result = await concatAndMux({
        normalized,
        displayDurations,
        voiceoverPath: voicePath,
        ...(musicPath ? { musicPath, musicDuckDb: env.MUSIC_DUCK_DB } : {}),
        outputPath,
        width,
        height,
        workDir,
        onProgress: (p) => reportProgress(p.percent, p.stage),
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

  /**
   * Download each scene's assets AND composite it, in one pooled pass keyed to
   * `RENDER_COMPOSITE_CONCURRENCY` (the CPU-bound step). Each pool worker
   * downloads its scene's background + overlays, then immediately composites
   * that scene, so compositing for scene N starts as soon as scene N's own
   * assets land instead of waiting on every scene in the project to download
   * first. Order is preserved so results line up with the timeline.
   */
  private async stageAndCompositeSegments(
    scenes: SceneRow[],
    audioDurationSec: number,
    workDir: string,
    width: number,
    height: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<{ normalized: string[]; displayDurations: number[] }> {
    const N = scenes.length;
    let done = 0;

    const results = await mapLimit(scenes, env.RENDER_COMPOSITE_CONCURRENCY, async (scene, i) => {
      const pad = String(i).padStart(4, '0');

      // Tile the timeline by scene start times so inter-scene pauses are covered
      // and video length matches the continuous voiceover.
      const next = scenes[i + 1];
      const displayEnd = next ? next.start_sec : audioDurationSec;
      const displayDurationSec = Math.max(MIN_SEGMENT_SEC, displayEnd - scene.start_sec);

      // Follow whichever assets exist (generation's span-based decision is the
      // single source of truth): a scene with stored STILLS renders as a gallery
      // (one still → a Ken Burns hold; several → rotating stills), otherwise it's
      // a video scene. This also covers a VIDEO scene held past a long wordless
      // gap, which generation produced as gallery stills.
      let segment: RenderSegment;
      const storedImages = (await this.ctx.repos.assets.listSceneImages(scene.id, AssetKind.IMAGE))
        .filter((a) => a.status === 'stored' && a.r2_key)
        .sort((a, b) => slotOf(a) - slotOf(b));
      if (storedImages.length > 0) {
        // GALLERY scene: download every stored still, in slot order.
        const imagePaths = storedImages.map((_, slot) => join(workDir, `img_${pad}_${slot}`));
        await Promise.all(storedImages.map((img, slot) => this.download(img.r2_key!, imagePaths[slot]!)));
        segment = { imagePaths, displayDurationSec };
      } else {
        // VIDEO scene: one or more ~8s clips played back-to-back at full frame.
        const backgrounds = (await this.ctx.repos.assets.listSceneVideos(scene.id)).filter(
          (b) => b.status === 'stored' && b.r2_key,
        );
        if (backgrounds.length === 0)
          throw new ValidationError('Scene background missing', { sceneId: scene.id });
        const backgroundPaths: string[] = [];
        await Promise.all(
          backgrounds.map((bg, slot) => {
            const p = join(workDir, `bg_${pad}_${slot}`);
            backgroundPaths.push(p);
            return this.download(bg.r2_key!, p);
          }),
        );
        segment = { backgroundPaths, displayDurationSec };
      }

      const normalizedPath = await compositeSegment(segment, i, i === N - 1, { width, height, workDir });
      done += 1;
      onProgress(done, N);
      return { normalizedPath, displayDurationSec };
    });

    return {
      normalized: results.map((r) => r.normalizedPath),
      displayDurations: results.map((r) => r.displayDurationSec),
    };
  }

  private async download(key: string, dest: string): Promise<void> {
    const stream = await this.ctx.storage.getObjectStream(key);
    await pipeline(stream, createWriteStream(dest));
  }

  /**
   * Fetch the global background-music track from its fixed R2 key, if it exists.
   * Returns the local path, or `undefined` when no music has been uploaded (the
   * common state until the file is put in place) — the render then stays
   * voiceover-only. Any download error is likewise swallowed to `undefined`:
   * music is a nice-to-have, never a reason to fail an otherwise-good render.
   */
  private async tryDownloadMusic(workDir: string): Promise<string | undefined> {
    const key = R2_PREFIX.music();
    try {
      const head = await this.ctx.storage.headObject(key);
      if (!head) return undefined; // never uploaded -> voiceover-only
      const dest = join(workDir, 'music.mp3');
      await this.download(key, dest);
      this.ctx.logger.info({ key }, 'render: background music found; will mix under voiceover');
      return dest;
    } catch (err) {
      this.ctx.logger.warn({ err, key }, 'render: music fetch failed; rendering voiceover-only');
      return undefined;
    }
  }
}
