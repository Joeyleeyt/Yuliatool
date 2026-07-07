import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  AssetKind,
  ProjectStatus,
  QueueName,
  SceneVisualType,
  NotFoundError,
  ValidationError,
  R2_PREFIX,
  ASSET_KIND_EXT,
  env,
} from '@yulia/core';
import type { Json } from '@yulia/db';
import {
  VideoGenerationService,
  ImageGenerationService,
  type GenerationService,
} from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

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

    const isVideo = scene.visual_type === SceneVisualType.VIDEO;
    const assetKind = isVideo ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    const asset = await this.ctx.repos.assets.findBySceneAndKind(sceneId, assetKind);
    if (!asset) throw new NotFoundError('Scene asset', sceneId);

    if (asset.status === 'stored') {
      await this.fanIn(projectId); // idempotent re-check
      return;
    }
    if (!asset.source_url) throw new ValidationError('Asset has no source URL', { assetId: asset.id });

    const ext = ASSET_KIND_EXT[assetKind] ?? (isVideo ? 'mp4' : 'png');
    const key = isVideo
      ? R2_PREFIX.sceneClip(projectId, sceneId, ext)
      : R2_PREFIX.sceneImage(projectId, sceneId, ext);

    await this.ctx.repos.assets.updateStatus(asset.id, 'downloading');
    await this.ctx.repos.scenes.updateStatus(sceneId, 'downloading');

    const gen = isVideo ? this.gens.video : this.gens.image;
    const stream = await gen.download({
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
      durationSec: scene.duration_sec,
    });
    await this.ctx.repos.scenes.updateStatus(sceneId, 'stored');

    await this.ctx.repos.generationHistory.record({
      projectId,
      sceneId,
      assetId: asset.id,
      provider: 'sixtynine_labs',
      operation: 'download',
      status: 'stored',
      response: { key, bytes: buffer.length } as unknown as Json,
    });

    this.ctx.logger.info({ projectId, sceneId, key, bytes: buffer.length }, 'asset stored in R2');
    await this.fanIn(projectId);
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
