import {
  AssetKind,
  ProjectStatus,
  QueueName,
  PIP_LAYOUT,
  INTERSTITIAL_SEED_KEY,
  sceneHasOverlay,
  overlayCountForDuration,
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
 * Gap between a scene's successive layer submits (video first, then each
 * overlay image slot). Spreads out the burst of POST /generate calls a single
 * scene fires via Promise.all — small enough to be invisible against a
 * generation's overall runtime (tens of seconds to minutes), but enough to
 * measurably thin out how many submits land in the exact same instant across
 * the worker's concurrently-running scenes.
 */
const SUBMIT_STAGGER_MS = 600;

/**
 * Per-scene generation for the picture-in-picture composite. Every scene has
 * TWO layers, produced by a single job:
 *   - background: a wide 16:9 VIDEO clip (kind 'video' -> VIDEO_CLIP asset)
 *   - overlay:    a portrait 4:5 IMAGE  (kind 'image' -> IMAGE asset)
 *
 * The two layers are generated CONCURRENTLY (see `run`) so a scene's latency is
 * max(video, image), not their sum.
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

    // Overlay treatment (decided at segmentation, stored on the scene):
    //   IMAGE -> product beat: unique background + a portrait overlay window.
    //   VIDEO -> full-frame breather: background only (NO overlay), and the
    //            background uses the SHARED interstitial seed/prompt so all such
    //            scenes recur the same establishing look (background reuse).
    const hasOverlay = sceneHasOverlay(scene.visual_type);

    // Generate the required layer(s) concurrently. Each layer polls 69Labs
    // independently and is idempotent (a retry only re-runs the layer that
    // failed), so a scene's wall-clock is max over its layers. The SUBMIT
    // moment (not the poll loop) is staggered a little per layer — see
    // SUBMIT_STAGGER_MS — so a single scene doesn't fire up to 4 simultaneous
    // POST /generate calls in the same instant; combined across the worker's
    // concurrent scenes that burst is what trips 69Labs' concurrent-job cap
    // (much lower than its per-minute rate limit — see SixtyNineLabsClient).
    const layers: Promise<void>[] = [
      this.runLayer(
        projectId,
        sceneId,
        'video',
        0,
        this.backgroundRequest(projectId, sceneId, prompt, hasOverlay),
        0,
      ),
    ];
    if (hasOverlay) {
      // Product scenes rotate 1–2 overlay images (each on screen ~5–8s), so a
      // longer scene gets a second, distinct overlay. Generate one IMAGE asset
      // per slot with its own prompt + seed.
      const overlayCount = overlayCountForDuration(scene.duration_sec);
      for (let slot = 0; slot < overlayCount; slot++) {
        layers.push(
          this.runLayer(
            projectId,
            sceneId,
            'image',
            slot,
            this.overlayRequest(projectId, sceneId, prompt, slot),
            (slot + 1) * SUBMIT_STAGGER_MS,
          ),
        );
      }
    }
    await Promise.all(layers);

    await this.ctx.jobs.dispatch(
      QueueName.DOWNLOAD_ASSETS,
      { projectId, sceneId },
      { projectId, sceneId },
    );
    this.ctx.logger.info({ projectId, sceneId }, 'scene layers generated; download dispatched');
  }

  /**
   * Ensure one layer's asset reaches `generated` (or is already stored). `slot`
   * is the rotation index for overlay images (0 for the background and the first
   * overlay); it's persisted in the asset's `metadata.slot` so download/render
   * can address each overlay independently. `submitDelayMs` staggers only the
   * initial POST /generate call (not the poll loop) — see SUBMIT_STAGGER_MS.
   */
  private async runLayer(
    projectId: string,
    sceneId: string,
    kind: GenerationKind,
    slot: number,
    req: GenerationRequest,
    submitDelayMs: number,
  ): Promise<void> {
    const assetKind = kind === 'video' ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    let asset =
      assetKind === AssetKind.IMAGE
        ? await this.ctx.repos.assets.findSceneImageBySlot(sceneId, assetKind, slot)
        : await this.ctx.repos.assets.findBySceneAndKind(sceneId, assetKind);
    if (asset?.status === 'stored') return; // fully done
    if (!asset) {
      asset = await this.ctx.repos.assets.create({
        projectId,
        sceneId,
        kind: assetKind,
        status: 'pending',
        contentType: CONTENT_TYPE[kind],
        ...(assetKind === AssetKind.IMAGE ? { metadata: { slot } } : {}),
      });
    }
    if (asset.status === 'generated' && asset.source_url) return; // awaiting download

    const gen = this.gens[kind];
    let externalId = asset.external_id;

    if (!externalId) {
      if (submitDelayMs > 0) await sleep(submitDelayMs);
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
      // 69Labs doesn't always populate a clean `error` string on failure — log
      // and persist the full raw response so a bare "failed: unknown" is
      // diagnosable (from Fly logs immediately, or generation_history.response
      // later) instead of silently discarded.
      this.ctx.logger.error(
        { projectId, sceneId, kind, externalId, raw: result.raw },
        '69labs generation failed',
      );
      await this.record(
        projectId,
        sceneId,
        asset.id,
        'poll',
        externalId,
        'failed',
        null,
        result.error,
        result.raw,
      );
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

  /**
   * Background layer, wide 16:9.
   *  - Product scenes (hasOverlay): the scene's own unique background prompt +
   *    a per-scene seed, so each product beat looks distinct.
   *  - Video-only scenes: the SHARED interstitial prompt + a project-wide
   *    interstitial seed (no sceneId), so every full-frame breather recurs the
   *    same establishing look — background reuse without an asset-dedup change.
   */
  private backgroundRequest(
    projectId: string,
    sceneId: string,
    prompt: PromptRow,
    hasOverlay: boolean,
  ): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    const aspectRatio = asString(params.backgroundAspectRatio, PIP_LAYOUT.backgroundAspectRatio);
    if (hasOverlay) {
      return {
        prompt: prompt.positive_prompt,
        ...(prompt.negative_prompt ? { negativePrompt: prompt.negative_prompt } : {}),
        aspectRatio,
        seed: seedFrom(projectId, sceneId, 'video'),
      };
    }
    // Shared recurring interstitial: same prompt + same seed across all
    // video-only scenes (falls back to this scene's prompt for projects
    // prompted before the interstitial field existed).
    const interstitial = asString(params.interstitialPrompt, prompt.positive_prompt);
    return {
      prompt: interstitial,
      ...(prompt.negative_prompt ? { negativePrompt: prompt.negative_prompt } : {}),
      aspectRatio,
      seed: seedFrom(projectId, INTERSTITIAL_SEED_KEY, 'video'),
    };
  }

  /**
   * Overlay layer for rotation `slot`. Slot 0 uses `overlayPrompt`; slot 1 uses
   * the distinct `overlayPrompt2` (falling back to the primary if the model
   * didn't provide one). The seed is slot-distinct so the two overlays differ.
   */
  private overlayRequest(
    projectId: string,
    sceneId: string,
    prompt: PromptRow,
    slot: number,
  ): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    // Fall back to the background prompt for projects prompted before the
    // two-layer format existed.
    const primary = asString(params.overlayPrompt, prompt.positive_prompt);
    const overlayPrompt = slot === 0 ? primary : asString(params.overlayPrompt2, primary);
    const overlayNegative = asString(params.overlayNegativePrompt, '');
    return {
      prompt: overlayPrompt,
      ...(overlayNegative ? { negativePrompt: overlayNegative } : {}),
      aspectRatio: asString(params.overlayAspectRatio, PIP_LAYOUT.overlayAspectRatio),
      // Slot in the seed so each overlay is a distinct image (slot 0 keeps the
      // original single-overlay seed for continuity with pre-rotation projects).
      seed: slot === 0
        ? seedFrom(projectId, sceneId, 'image')
        : seedFrom(projectId, sceneId, 'image', String(slot)),
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
      await sleep(env.GENERATION_POLL_INTERVAL_SEC * 1000);
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
    raw?: unknown,
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
      // The full 69Labs response, kept alongside `error` since that field is
      // sometimes empty/non-string on failure — this is then the only record
      // of why a generation actually failed.
      ...(raw !== undefined ? { response: raw as unknown as Json } : {}),
      ...(error ? { error: { message: error } as unknown as Json } : {}),
    });
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
