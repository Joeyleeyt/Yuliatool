import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  AssetKind,
  ProjectStatus,
  QueueName,
  SceneVisualType,
  sceneHasOverlay,
  NotFoundError,
  ValidationError,
  R2_PREFIX,
  ASSET_KIND_EXT,
  env,
} from '@yulia/core';
import type { Json, SceneRow } from '@yulia/db';
import {
  VideoGenerationService,
  ImageGenerationService,
  type GenerationService,
} from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';
import { mostSimilar } from '../ai/index.js';

/**
 * Download stage: stream the provider's generated result into R2 and mark the
 * asset (and scene) stored. Setting the scene to `stored` bumps
 * `projects.completed_scenes` (DB trigger); the atomic fan-in then advances the
 * project to RENDERING once every scene is in.
 */
export class DownloadAssetsService {
  private readonly projects: ProjectService;
  private readonly gens: Record<'video' | 'image', GenerationService>;

  constructor(
    private readonly ctx: AppContext,
    gens?: Partial<Record<'video' | 'image', GenerationService>>,
  ) {
    this.projects = new ProjectService(ctx);
    this.gens = {
      video: gens?.video ?? new VideoGenerationService(),
      image: gens?.image ?? new ImageGenerationService(),
    };
  }

  async run(projectId: string, sceneId: string): Promise<void> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const scene = await this.ctx.repos.scenes.findById(sceneId);
    if (!scene || scene.project_id !== projectId) throw new NotFoundError('Scene', sceneId);

    if (scene.status === 'stored') {
      await this.fanIn(projectId); // idempotent re-check
      return;
    }

    await this.ctx.repos.scenes.updateStatus(sceneId, 'downloading');

    // The BACKGROUND is required for every scene — a scene can't render without
    // one. Try the scene's OWN generated background first (best match, since it
    // was prompted from this scene). If it can't be produced, rather than fail
    // the project we BORROW the background of the already-stored scene whose
    // narration is most similar, so the stand-in visual still fits what's being
    // said. Only if there's no usable donor at all does the failure propagate.
    // A scene's background is one or more clips (slots) played back-to-back.
    // Slot 0 is REQUIRED (a scene can't render without a background): if it can't
    // be produced, borrow a similar scene's background as a stand-in. Later slots
    // are best-effort — if one fails, the scene still renders with the clips that
    // stored (the remainder zoom-fills), so we don't wedge the project on them.
    const backgrounds = await this.ctx.repos.assets.listSceneVideos(sceneId);
    let borrowedBackground = false;
    let storedBackgrounds = 0;
    for (const bg of backgrounds) {
      const slot = overlaySlotOf(bg);
      try {
        await this.downloadLayer(projectId, sceneId, 'video', scene.duration_sec, slot);
        storedBackgrounds += 1;
      } catch (err) {
        if (slot !== 0) {
          this.ctx.logger.warn(
            { projectId, sceneId, slot, err },
            'secondary background clip failed; scene renders with the clips that stored',
          );
          continue;
        }
        const donor = await this.reuseSimilarBackground(projectId, scene);
        // No stand-in yet -> re-throw so BullMQ retries. Other scenes download
        // concurrently, so a later attempt (after backoff) usually finds a stored
        // donor. Only if none exists by the final attempt does the project fail.
        if (!donor) throw err;
        borrowedBackground = true;
        storedBackgrounds += 1;
        this.ctx.logger.warn(
          { projectId, sceneId, donorSceneId: donor.sceneId, score: donor.score, via: donor.via, err },
          `own background unavailable; reusing ${donor.via} scene background`,
        );
      }
    }
    if (storedBackgrounds === 0) {
      throw new ValidationError('No background clip could be stored', { projectId, sceneId });
    }

    // The OVERLAY is best-effort and only for product beats. If it can't be
    // produced (generation never yielded a source, or the download keeps
    // failing), we DON'T wedge the project: we demote the scene to full-frame
    // video-only (the overlay is dropped, the background fills the frame) so it
    // keeps its slot + duration and audio stays in sync. A transient download
    // error still surfaces so BullMQ can retry within the attempt budget; only
    // once retries are exhausted does the wrapper's final-failure path apply —
    // but a missing/never-generated overlay is terminal immediately, so we
    // detect that here and demote rather than burn retries on it.
    if (borrowedBackground) {
      // The background is a stand-in from another scene; this scene's own
      // overlay wouldn't sit naturally over it, so render it full-frame.
      await this.demoteToVideoOnly(projectId, sceneId, 'background borrowed from a similar scene');
    } else if (sceneHasOverlay(scene.visual_type)) {
      // A product scene rotates 1–2 overlay slots. Download each slot best-
      // effort: if the PRIMARY (slot 0) can't be produced, demote the whole
      // scene to full-frame video-only. If a LATER slot fails, keep the scene
      // with the slots that succeeded (render just rotates through fewer).
      const overlays = await this.ctx.repos.assets.listSceneImages(sceneId, AssetKind.IMAGE);
      let stored = 0;
      for (const overlay of overlays) {
        const slot = overlaySlotOf(overlay);
        if (!overlay.source_url) {
          if (slot === 0) {
            await this.demoteToVideoOnly(projectId, sceneId, 'primary overlay missing or never generated');
            stored = 0;
            break;
          }
          this.ctx.logger.warn({ projectId, sceneId, slot }, 'secondary overlay missing; skipping slot');
          continue;
        }
        try {
          await this.downloadLayer(projectId, sceneId, 'image', scene.duration_sec, slot);
          stored += 1;
        } catch (err) {
          if (slot === 0) {
            this.ctx.logger.warn({ projectId, sceneId, err }, 'primary overlay download failed; demoting to full-frame');
            await this.demoteToVideoOnly(projectId, sceneId, 'primary overlay download failed');
            stored = 0;
            break;
          }
          this.ctx.logger.warn({ projectId, sceneId, slot, err }, 'secondary overlay download failed; skipping slot');
        }
      }
      // No overlay could be stored at all (e.g. none were generated) — full-frame.
      if (stored === 0 && sceneHasOverlay(scene.visual_type)) {
        await this.demoteToVideoOnly(projectId, sceneId, 'no overlay slot available');
      }
    }

    // Scene is complete once its required layer(s) are in R2 -> counts toward
    // fan-in. (A demoted scene needs only the background, already stored above.)
    await this.ctx.repos.scenes.updateStatus(sceneId, 'stored');
    await this.fanIn(projectId);
  }

  /**
   * Fallback for an unproducible background: reuse another stored scene's
   * background clip, repointing THIS scene's VIDEO_CLIP asset at that donor's R2
   * object (shared key, no copy). Returns the donor scene id + similarity score
   * + how it was chosen, or null if NO donor is stored yet.
   *
   * Preference order:
   *   1. the stored scene whose narration is most SIMILAR (positive overlap) —
   *      the stand-in visual fits what's being said;
   *   2. otherwise a stored full-frame BREATHER (video-only) scene — a neutral
   *      establishing clip is the safest generic stand-in;
   *   3. otherwise any stored scene (last resort).
   *
   * "Stored" donors already finished downloading their own background. We never
   * borrow from `scene` itself.
   */
  private async reuseSimilarBackground(
    projectId: string,
    scene: SceneRow,
  ): Promise<{ sceneId: string; score: number; via: 'similar' | 'breather' | 'any' } | null> {
    // Repoint THIS scene's primary (slot 0) background at a donor's stored clip.
    const targetAsset = await this.ctx.repos.assets.findSceneVideoBySlot(scene.id, 0);
    if (!targetAsset) return null;

    const scenes = await this.ctx.repos.scenes.listByProject(projectId);
    // Candidate donors: every OTHER scene with a stored primary (slot 0)
    // background clip — the borrowed stand-in is a single clip, so slot 0 alone.
    const donors: { scene: SceneRow; assetId: string }[] = [];
    for (const s of scenes) {
      if (s.id === scene.id) continue;
      const a = await this.ctx.repos.assets.findSceneVideoBySlot(s.id, 0);
      if (a?.status === 'stored' && a.r2_key) donors.push({ scene: s, assetId: a.id });
    }
    if (donors.length === 0) return null;

    // Tier 1: most-similar by narration (only when there's real overlap).
    const target = scene.narration_text ?? scene.title ?? '';
    const best = mostSimilar(target, donors, (d) => d.scene.narration_text ?? d.scene.title ?? '');

    let chosen: { scene: SceneRow; assetId: string };
    let via: 'similar' | 'breather' | 'any';
    let score: number;
    if (best) {
      chosen = best.item;
      score = best.score;
      via = 'similar';
    } else {
      // Tier 2: a full-frame breather (video-only) scene — the shared
      // establishing/interstitial look — as the neutral generic stand-in.
      const breather = donors.find((d) => !sceneHasOverlay(d.scene.visual_type));
      // Tier 3: anything stored, as a last resort.
      chosen = breather ?? donors[0]!;
      score = 0;
      via = breather ? 'breather' : 'any';
    }

    await this.ctx.repos.assets.reuseStoredObject(targetAsset.id, chosen.assetId);
    return { sceneId: chosen.scene.id, score, via };
  }

  /**
   * Demote a product scene to full-frame video-only: flip its `visual_type` so
   * generation/render treat it as a background-only breather. The already-stored
   * background carries the scene; the overlay is simply dropped.
   */
  private async demoteToVideoOnly(projectId: string, sceneId: string, reason: string): Promise<void> {
    await this.ctx.repos.scenes.setVisualType(sceneId, SceneVisualType.VIDEO);
    await this.ctx.repos.activity.log({
      projectId,
      type: 'scene_demoted',
      message: 'Scene fell back to full-frame video (overlay unavailable)',
      data: { sceneId, reason } as unknown as Json,
    });
    this.ctx.logger.info({ projectId, sceneId, reason }, 'scene demoted to full-frame video-only');
  }

  /**
   * Download one layer's generated result into R2 and mark that asset stored.
   * `slot` selects the overlay image (0 for the background and the first
   * overlay); it addresses both the asset row and the R2 key.
   */
  private async downloadLayer(
    projectId: string,
    sceneId: string,
    kind: 'video' | 'image',
    durationSec: number,
    slot = 0,
  ): Promise<void> {
    const isVideo = kind === 'video';
    const assetKind = isVideo ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    // Both layers are slot-addressed now (background clips AND overlay images).
    const asset = await this.ctx.repos.assets.findSceneImageBySlot(sceneId, assetKind, slot);
    if (!asset) throw new NotFoundError(`Scene ${kind} asset`, sceneId);
    if (asset.status === 'stored') return; // already downloaded on a prior run
    if (!asset.source_url) throw new ValidationError('Asset has no source URL', { assetId: asset.id });

    const ext = ASSET_KIND_EXT[assetKind] ?? (isVideo ? 'mp4' : 'png');
    const key = isVideo
      ? R2_PREFIX.sceneClip(projectId, sceneId, ext, slot)
      : R2_PREFIX.sceneImage(projectId, sceneId, ext, slot);

    await this.ctx.repos.assets.updateStatus(asset.id, 'downloading');
    this.ctx.logger.info({ projectId, sceneId, kind }, 'downloading generated layer into R2');

    const stream = await this.gens[kind].download({
      externalId: asset.external_id ?? '',
      status: 'completed',
      resultUrl: asset.source_url,
      costUsd: null,
      error: null,
      raw: null,
    });

    const { buffer, sha256 } = await collect(stream);
    const contentType = asset.content_type ?? (isVideo ? 'video/mp4' : 'image/png');

    await this.ctx.storage.putObject(key, buffer, { contentType, checksumSha256: sha256 });
    await this.ctx.repos.assets.markStored(asset.id, {
      r2Bucket: env.R2_BUCKET,
      r2Key: key,
      contentType,
      sizeBytes: buffer.length,
      checksumSha256: sha256,
      durationSec,
    });

    await this.ctx.repos.generationHistory.record({
      projectId,
      sceneId,
      assetId: asset.id,
      provider: 'sixtynine_labs',
      operation: 'download',
      status: 'stored',
      response: { key, bytes: buffer.length } as unknown as Json,
    });
    this.ctx.logger.info({ projectId, sceneId, key, bytes: buffer.length }, 'layer stored in R2');
  }

  /**
   * Atomic, race-free fan-in. Exactly one concurrent download worker wins the
   * claim (the last scene to store); it creates the render row and dispatches
   * the render job.
   */
  private async fanIn(projectId: string): Promise<void> {
    const claimed = await this.ctx.repos.projects.tryClaimAssetsComplete(projectId);
    if (!claimed) return;

    const render = await this.ctx.repos.renders.create({
      projectId,
      format: claimed.render_format,
    });
    await this.projects.transition(projectId, ProjectStatus.RENDERING);
    await this.ctx.jobs.dispatch(QueueName.RENDERING, { projectId, renderId: render.id }, { projectId });

    this.ctx.logger.info({ projectId, renderId: render.id }, 'all assets stored; rendering dispatched');
  }
}

/** Read an overlay image asset's rotation slot from its metadata (default 0). */
function overlaySlotOf(asset: { metadata: Json }): number {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const slot = Number(meta.slot);
  return Number.isFinite(slot) && slot >= 0 ? Math.trunc(slot) : 0;
}

/** Buffer a readable stream and compute its SHA-256 in one pass. */
async function collect(stream: Readable): Promise<{ buffer: Buffer; sha256: string }> {
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    hash.update(buf);
    chunks.push(buf);
  }
  return { buffer: Buffer.concat(chunks), sha256: hash.digest('hex') };
}
