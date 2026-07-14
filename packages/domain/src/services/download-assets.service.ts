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
  keyIndexForJob,
  type GenerationService,
} from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';
import { topSimilar } from '../ai/index.js';

/**
 * How many of the most-similar donor backgrounds the borrow-fallback spreads a
 * run of borrows across (rotated by scene ordinal), so a topic whose scenes all
 * borrow doesn't collapse onto one repeated clip. Small so the stand-in still
 * fits the narration, but >1 so consecutive borrows differ.
 */
const BORROW_SPREAD_K = 4;

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

    // Videos and gallery stills are SEPARATE full-frame scenes. Follow whichever
    // assets generation actually produced (its span-based gallery decision is the
    // single source of truth) rather than re-deciding from visual_type: a VIDEO
    // scene held past a long wordless gap is generated as gallery stills.
    const images = await this.ctx.repos.assets.listSceneImages(sceneId, AssetKind.IMAGE);
    if (images.length > 0) {
      await this.downloadImageScene(projectId, sceneId, scene, images);
    } else {
      await this.downloadVideoScene(projectId, sceneId, scene);
    }
    await this.ctx.repos.scenes.updateStatus(sceneId, 'stored');
    await this.fanIn(projectId);
  }

  /**
   * VIDEO scene: download its background clip slots. Slot 0 is REQUIRED — if it
   * can't be produced, borrow a similar scene's video as a stand-in. Later slots
   * are best-effort (a shortfall fills seamlessly at render time).
   */
  private async downloadVideoScene(projectId: string, sceneId: string, scene: SceneRow): Promise<void> {
    const backgrounds = await this.ctx.repos.assets.listSceneVideos(sceneId);
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
  }

  /**
   * GALLERY scene: download its full-frame stills — one or several slots that the
   * render rotates through. Slot 0 is REQUIRED — if it can't be produced, borrow a
   * similar scene's already-stored VIDEO as a stand-in and flip this scene to
   * VIDEO so the render treats it as a clip rather than a missing image. Later
   * slots are best-effort: a shortfall just rotates fewer stills at render time.
   */
  private async downloadImageScene(
    projectId: string,
    sceneId: string,
    scene: SceneRow,
    images: { metadata: Json }[],
  ): Promise<void> {
    // Attempt slot 0 first (it's the required one), then the rest.
    const slots = [...new Set(images.map((img) => overlaySlotOf(img)))].sort((a, b) => a - b);
    let stored = 0;
    for (const slot of slots) {
      try {
        await this.downloadLayer(projectId, sceneId, 'image', scene.duration_sec, slot);
        stored += 1;
      } catch (err) {
        if (slot !== 0) {
          this.ctx.logger.warn(
            { projectId, sceneId, slot, err },
            'secondary gallery still failed; scene renders with the stills that stored',
          );
          continue;
        }
        const donor = await this.reuseSimilarBackground(projectId, scene);
        if (!donor) throw err; // no stand-in yet -> retry
        // The borrowed stand-in is a video clip; render this scene as video.
        await this.ctx.repos.scenes.setVisualType(sceneId, SceneVisualType.VIDEO);
        this.ctx.logger.warn(
          { projectId, sceneId, donorSceneId: donor.sceneId, via: donor.via, err },
          `first gallery still unavailable; borrowed ${donor.via} scene video and flipped scene to VIDEO`,
        );
        return;
      }
    }
    if (stored === 0) {
      throw new ValidationError('No gallery still could be stored', { projectId, sceneId });
    }
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

    // Tier 1: similar by narration — but SPREAD across the top matches, not
    // always the single best. A whole topic (e.g. the perfume section) has
    // near-identical narration across its scenes, so if every borrowing scene
    // picked the one top donor, that stretch became ONE clip repeated for a
    // minute ("looping with one scene"). Instead, take the top-K similar donors
    // and rotate among them by this scene's ordinal, so consecutive borrows land
    // on DIFFERENT clips and the section stays visually varied.
    const target = scene.narration_text ?? scene.title ?? '';
    const top = topSimilar(
      target,
      donors,
      (d) => d.scene.narration_text ?? d.scene.title ?? '',
      BORROW_SPREAD_K,
    );

    let chosen: { scene: SceneRow; assetId: string };
    let via: 'similar' | 'breather' | 'any';
    let score: number;
    if (top.length > 0) {
      const pick = top[scene.scene_index % top.length]!;
      chosen = pick.item;
      score = pick.score;
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
    // Same key that GENERATED this job must download it (the id lives only on
    // that account) — recompute the same pinned index from the stable job key.
    const keyIndex = keyIndexForJob(`${sceneId}:${kind}:${slot}`, this.gens[kind].keyCount);
    this.ctx.logger.info({ projectId, sceneId, kind, keyIndex }, 'downloading generated layer into R2');

    const stream = await this.gens[kind].download(
      {
        externalId: asset.external_id ?? '',
        status: 'completed',
        resultUrl: asset.source_url,
        costUsd: null,
        error: null,
        raw: null,
      },
      keyIndex,
    );

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
