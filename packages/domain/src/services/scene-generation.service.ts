import {
  AssetKind,
  ProjectStatus,
  QueueName,
  GENERATION_POLL_INTERVAL_SEC,
  PIP_LAYOUT,
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  env,
} from '@yulia/core';
import type { Json, PromptRow } from '@yulia/db';
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
 * Per-scene generation for the picture-in-picture composite. Every scene has
 * TWO layers, produced by a single job:
 *   - background: a wide 16:9 VIDEO clip (kind 'video' -> VIDEO_CLIP asset)
 *   - overlay:    a portrait 4:5 IMAGE  (kind 'image' -> IMAGE asset)
 *
 * Resumable + idempotent per layer:
 *   - a layer already stored/generated -> skip (no double-spend)
 *   - a layer with an external_id -> reconcile by polling (no resubmit)
 *   - provider failure -> reset that layer + retryable throw (BullMQ resubmits)
 * Once BOTH layers are generated it dispatches the download stage.
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

  async run(projectId: string, sceneId: string): Promise<void> {
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

    const prompt = await this.ctx.repos.prompts.getActiveByScene(sceneId);
    if (!prompt) throw new ValidationError('No active prompt for scene', { sceneId });

    // Generate both layers (background video first, then overlay image). Each is
    // independently idempotent, so a retry only re-runs the layer that failed.
    await this.runLayer(projectId, sceneId, 'video', this.backgroundRequest(projectId, sceneId, prompt));
    await this.runLayer(projectId, sceneId, 'image', this.overlayRequest(projectId, sceneId, prompt));

    await this.ctx.jobs.dispatch(
      QueueName.DOWNLOAD_ASSETS,
      { projectId, sceneId },
      { projectId, sceneId },
    );
    this.ctx.logger.info({ projectId, sceneId }, 'scene layers generated; download dispatched');
  }

  /** Ensure one layer's asset reaches `generated` (or is already stored). */
  private async runLayer(
    projectId: string,
    sceneId: string,
    kind: GenerationKind,
    req: GenerationRequest,
  ): Promise<void> {
    const assetKind = kind === 'video' ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    let asset = await this.ctx.repos.assets.findBySceneAndKind(sceneId, assetKind);
    if (asset?.status === 'stored') return; // fully done
    if (!asset) {
      asset = await this.ctx.repos.assets.create({
        projectId,
        sceneId,
        kind: assetKind,
        status: 'pending',
        contentType: CONTENT_TYPE[kind],
      });
    }
    if (asset.status === 'generated' && asset.source_url) return; // awaiting download

    const gen = this.gens[kind];
    let externalId = asset.external_id;

    if (!externalId) {
      this.ctx.logger.info({ projectId, sceneId, kind }, 'submitting layer to 69labs');
      const submission = await gen.submit(req);
      externalId = submission.externalId;
      await this.ctx.repos.assets.setSubmitted(asset.id, {
        provider: 'sixtynine_labs',
        externalId,
      });
      await this.record(projectId, sceneId, asset.id, 'submit', externalId, 'submitted', null, null);
    }

    this.ctx.logger.info({ projectId, sceneId, kind, externalId }, 'awaiting 69labs generation');
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
    await this.record(projectId, sceneId, asset.id, 'poll', externalId, 'completed', result.costUsd, null);
  }

  /** Background layer: the scene's primary (positive/negative) prompt, wide 16:9. */
  private backgroundRequest(projectId: string, sceneId: string, prompt: PromptRow): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    return {
      prompt: prompt.positive_prompt,
      ...(prompt.negative_prompt ? { negativePrompt: prompt.negative_prompt } : {}),
      aspectRatio: asString(params.backgroundAspectRatio, PIP_LAYOUT.backgroundAspectRatio),
      seed: seedFrom(projectId, sceneId, 'video'),
    };
  }

  /** Overlay layer: the complementary portrait prompt stored in `parameters`. */
  private overlayRequest(projectId: string, sceneId: string, prompt: PromptRow): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    // Fall back to the background prompt for projects prompted before the
    // two-layer format existed.
    const overlayPrompt = asString(params.overlayPrompt, prompt.positive_prompt);
    const overlayNegative = asString(params.overlayNegativePrompt, '');
    return {
      prompt: overlayPrompt,
      ...(overlayNegative ? { negativePrompt: overlayNegative } : {}),
      aspectRatio: asString(params.overlayAspectRatio, PIP_LAYOUT.overlayAspectRatio),
      seed: seedFrom(projectId, sceneId, 'image'),
    };
  }

  private async pollUntilTerminal(
    gen: GenerationService,
    externalId: string,
  ): Promise<GenerationResult> {
    const deadline = Date.now() + env.GENERATION_POLL_TIMEOUT_SEC * 1000;
    let polls = 0;
    for (;;) {
      const result = await gen.poll(externalId);
      polls += 1;
      this.ctx.logger.debug({ externalId, poll: polls, status: result.status }, 'polled 69labs');
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

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
