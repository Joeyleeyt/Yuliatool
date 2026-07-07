import {
  AssetKind,
  ProjectStatus,
  QueueName,
  SceneVisualType,
  GENERATION_POLL_INTERVAL_SEC,
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  env,
} from '@yulia/core';
import type { Json } from '@yulia/db';
import {
  VideoGenerationService,
  ImageGenerationService,
  type GenerationService,
  type GenerationKind,
  type GenerationRequest,
  type GenerationResult,
} from '@yulia/services';
import type { AppContext } from '../context.js';
import { seedFrom } from '../ai/index.js';

const CONTENT_TYPE: Record<GenerationKind, string> = {
  video: 'video/mp4',
  image: 'image/png',
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Per-scene generation (video or image). Resumable + idempotent:
 *   - already stored -> no-op
 *   - has external_id -> reconcile by polling (no resubmit, no double-spend)
 *   - provider failure -> reset + retryable throw (BullMQ resubmits next attempt)
 * On success it marks the asset `generated` and dispatches the download stage.
 */
export class SceneGenerationService {
  private readonly gens: Record<GenerationKind, GenerationService>;

  constructor(
    private readonly ctx: AppContext,
    gens?: Partial<Record<GenerationKind, GenerationService>>,
  ) {
    this.gens = {
      video: gens?.video ?? new VideoGenerationService(),
      image: gens?.image ?? new ImageGenerationService(),
    };
  }

  async run(projectId: string, sceneId: string, kind: GenerationKind): Promise<void> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (
      project.status !== ProjectStatus.VIDEO_GENERATION &&
      project.status !== ProjectStatus.WAITING_ASSETS
    ) {
      this.ctx.logger.info({ projectId, sceneId, status: project.status }, 'generation skipped');
      return;
    }

    const scene = await this.ctx.repos.scenes.findById(sceneId);
    if (!scene || scene.project_id !== projectId) throw new NotFoundError('Scene', sceneId);

    const assetKind = kind === 'video' ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    let asset = await this.ctx.repos.assets.findBySceneAndKind(sceneId, assetKind);
    if (asset?.status === 'stored') return; // already fully done

    const prompt = await this.ctx.repos.prompts.getActiveByScene(sceneId);
    if (!prompt) throw new ValidationError('No active prompt for scene', { sceneId });

    if (!asset) {
      asset = await this.ctx.repos.assets.create({
        projectId,
        sceneId,
        kind: assetKind,
        status: 'pending',
        contentType: CONTENT_TYPE[kind],
      });
    }

    const gen = this.gens[kind];

    // If not yet generated, submit (unless already submitted) and poll.
    if (asset.status !== 'generated' || !asset.source_url) {
      let externalId = asset.external_id;

      if (!externalId) {
        const submission = await gen.submit(this.buildRequest(kind, prompt.positive_prompt, prompt.negative_prompt, prompt.parameters, sceneId, projectId));
        externalId = submission.externalId;
        await this.ctx.repos.assets.setSubmitted(asset.id, {
          provider: 'sixtynine_labs',
          externalId,
        });
        await this.ctx.repos.scenes.updateStatus(sceneId, 'submitted');
        await this.record(projectId, sceneId, asset.id, 'submit', externalId, 'submitted', null, null);
      }

      const result = await this.pollUntilTerminal(gen, externalId);

      if (result.status === 'failed') {
        await this.ctx.repos.assets.clearGeneration(asset.id);
        await this.record(projectId, sceneId, asset.id, 'poll', externalId, 'failed', null, result.error);
        throw new ExternalServiceError('69labs', `generation failed: ${result.error ?? 'unknown'}`, {
          retryable: true,
        });
      }
      if (!result.resultUrl) {
        throw new ExternalServiceError('69labs', 'completed without result URL', { retryable: true });
      }

      await this.ctx.repos.assets.setGenerated(asset.id, result.resultUrl);
      await this.ctx.repos.scenes.updateStatus(sceneId, 'generated');
      await this.record(projectId, sceneId, asset.id, 'poll', externalId, 'completed', result.costUsd, null);
    }

    await this.ctx.jobs.dispatch(
      QueueName.DOWNLOAD_ASSETS,
      { projectId, sceneId },
      { projectId, sceneId },
    );
    this.ctx.logger.info({ projectId, sceneId, kind }, 'scene generated; download dispatched');
  }

  private buildRequest(
    kind: GenerationKind,
    positive: string,
    negative: string | null,
    parameters: Json,
    sceneId: string,
    projectId: string,
  ): GenerationRequest {
    const params = (parameters ?? {}) as Record<string, unknown>;
    const aspectRatio = typeof params.aspectRatio === 'string' ? params.aspectRatio : '9:16';
    const durationSec = typeof params.durationSec === 'number' ? params.durationSec : undefined;
    return {
      prompt: positive,
      ...(negative ? { negativePrompt: negative } : {}),
      aspectRatio,
      ...(kind === 'video' && durationSec !== undefined ? { durationSec } : {}),
      seed: seedFrom(projectId, sceneId, kind),
    };
  }

  private async pollUntilTerminal(
    gen: GenerationService,
    externalId: string,
  ): Promise<GenerationResult> {
    const deadline = Date.now() + env.GENERATION_POLL_TIMEOUT_SEC * 1000;
    for (;;) {
      const result = await gen.poll(externalId);
      if (result.status === 'completed' || result.status === 'failed') return result;
      if (Date.now() > deadline) {
        // Timeout is retryable: the next attempt reconciles this same external_id.
        throw new ExternalServiceError('69labs', 'poll timeout', { retryable: true });
      }
      await sleep(GENERATION_POLL_INTERVAL_SEC * 1000);
    }
  }

  private async record(
    projectId: string,
    sceneId: string,
    assetId: string,
    operation: string,
    externalId: string,
    status: string,
    costUsd: number | null,
    error: string | null,
  ): Promise<void> {
    await this.ctx.repos.generationHistory.record({
      projectId,
      sceneId,
      assetId,
      provider: 'sixtynine_labs',
      operation,
      externalId,
      status,
      costUsd,
      ...(error ? { error: { message: error } as unknown as Json } : {}),
    });
  }
}

// Referenced only for the union constraint; keeps SceneVisualType imported where
// callers map scene.visual_type -> GenerationKind.
export function kindForVisualType(visualType: SceneVisualType): GenerationKind {
  return visualType === SceneVisualType.VIDEO ? 'video' : 'image';
}
