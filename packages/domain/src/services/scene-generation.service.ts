import {
  AssetKind,
  ProjectStatus,
  QueueName,
  PIP_LAYOUT,
  sceneRendersAsGallery,
  imageCountForDuration,
  backgroundClipCountForDuration,
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  env,
} from '@yulia/core';
import type { Json, PromptRow, SceneRow } from '@yulia/db';
import {
  VideoGenerationService,
  ImageGenerationService,
  keyIndexForJob,
  type GenerationService,
  type GenerationKind,
  type GenerationRequest,
  type GenerationResult,
} from '@yulia/services';
import type { AppContext } from '../context.js';
import { seedFrom, withRealismPreamble, mergeNegativePrompt } from '../ai/index.js';
import { HandCheckService, failOpen as handCheckFailOpen } from './hand-check.service.js';
import type { HandCheckOutput } from '@yulia/core';

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
 * How long a single 69Labs job may be reconciled (re-polled across retries)
 * before it's presumed permanently wedged and abandoned for a fresh resubmit,
 * as a multiple of GENERATION_POLL_TIMEOUT_SEC: the first timeout gets one
 * grace reconcile (in case the job really was just slow and is about to
 * finish), the second confirms it's stuck rather than transiently delayed.
 */
const RECONCILE_BUDGET_POLL_TIMEOUTS = 2;

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
  private readonly handCheck: HandCheckService;

  constructor(
    private readonly ctx: AppContext,
    gens?: Partial<Record<GenerationKind, GenerationService>>,
    handCheck?: HandCheckService,
  ) {
    this.gens = {
      video: gens?.video ?? new VideoGenerationService(),
      image: gens?.image ?? new ImageGenerationService(),
    };
    this.handCheck = handCheck ?? new HandCheckService(ctx);
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

    // A scene is shown from its own start until the NEXT scene starts (the render
    // tiles the timeline this way), so its on-screen span can exceed its own
    // narration length when a long wordless gap follows it. Compute that display
    // span here so the background clip count covers the whole span with distinct
    // footage instead of looping a short assembly (the "looped for 2 min" bug).
    const displaySpanSec = await this.displaySpanSec(projectId, scene);

    // Videos and images are now SEPARATE full-frame scenes (no picture-in-
    // picture). A scene generates EITHER one full-frame image OR several video
    // clips — never both — so the asset count (and generation time) drops.
    const layers: Promise<void>[] = [];
    if (sceneRendersAsGallery(scene.visual_type, displaySpanSec)) {
      // GALLERY scene: several distinct full-frame (16:9) stills that the render
      // rotates through (Ken Burns + crossfade) to fill the on-screen span — a
      // held IMAGE beat OR a VIDEO beat held past a long wordless gap. No video
      // clip. Count is sized to the display span (~one still per IMAGE_SLOT_SEC).
      // This is the SINGLE span-based image/video decision; download + render
      // follow whichever assets this produces, so they can never disagree.
      const imageCount = imageCountForDuration(displaySpanSec);
      for (let slot = 0; slot < imageCount; slot++) {
        layers.push(
          this.runLayer(
            projectId,
            sceneId,
            'image',
            slot,
            (regen) => this.fullFrameImageRequest(projectId, sceneId, prompt, slot, regen),
            slot * SUBMIT_STAGGER_MS,
          ),
        );
      }
    } else {
      // VIDEO scene: several ~8s clips played back-to-back to fill the display
      // span at normal speed (sized to the on-screen span, gap-aware). Each slot
      // gets a distinct seed but the same prompt (one continuous world/grade).
      const backgroundCount = backgroundClipCountForDuration(displaySpanSec);
      for (let slot = 0; slot < backgroundCount; slot++) {
        layers.push(
          this.runLayer(
            projectId,
            sceneId,
            'video',
            slot,
            // Factory: `regen` (0 on first try, 1.. on hand-check retries) varies
            // the seed so a regenerated clip actually differs from the rejected one.
            (regen) => this.backgroundRequest(projectId, sceneId, prompt, slot, regen),
            slot * SUBMIT_STAGGER_MS,
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
   * On-screen span of a scene = from its start until the NEXT scene starts (the
   * render tiles the timeline by scene start times). For the LAST scene it runs
   * to the transcript/audio end. This can exceed the scene's own narration length
   * across a wordless gap; the background clip count is sized to THIS so a long
   * hold is covered by distinct clips rather than a long loop. Falls back to the
   * scene's own duration if neighbors/transcript are unavailable.
   */
  private async displaySpanSec(projectId: string, scene: SceneRow): Promise<number> {
    const scenes = await this.ctx.repos.scenes.listByProject(projectId);
    const idx = scenes.findIndex((s) => s.id === scene.id);
    const next = idx >= 0 ? scenes[idx + 1] : undefined;
    let end: number;
    if (next) {
      end = next.start_sec;
    } else {
      const transcript = await this.ctx.repos.transcripts.findByProject(projectId).catch(() => null);
      end = transcript?.duration_sec ?? scene.end_sec;
    }
    const span = end - scene.start_sec;
    return span > 0 ? span : scene.duration_sec;
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
    reqFactory: (regen: number) => GenerationRequest,
    submitDelayMs: number,
  ): Promise<void> {
    const assetKind = kind === 'video' ? AssetKind.VIDEO_CLIP : AssetKind.IMAGE;
    // Both layers are now slot-addressed: a scene has 1–2 overlay images AND
    // several background clips (played back-to-back to fill the scene at normal
    // speed), so each is looked up + persisted by its rotation/sequence slot.
    let asset = await this.ctx.repos.assets.findSceneImageBySlot(sceneId, assetKind, slot);
    if (asset?.status === 'stored') return; // fully done
    if (!asset) {
      asset = await this.ctx.repos.assets.create({
        projectId,
        sceneId,
        kind: assetKind,
        status: 'pending',
        contentType: CONTENT_TYPE[kind],
        metadata: { slot },
      });
    }
    if (asset.status === 'generated' && asset.source_url) return; // awaiting download

    // `regen` counts hand-check-triggered regenerations (persisted in metadata so
    // it survives BullMQ job retries). It feeds BOTH the seed (so a regenerated
    // clip differs) and the retry budget.
    const regen = regenCountOf(asset);
    const req = reqFactory(regen);
    const gen = this.gens[kind];
    // Pin this job to ONE key in the pool for its whole submit→poll→download
    // lifecycle (the provider id only exists on the account that created it).
    // Derived from stable ids so generation, download, and reconcile all agree
    // without persisting the choice. Single key -> always 0.
    const keyIndex = keyIndexForJob(`${sceneId}:${kind}:${slot}`, gen.keyCount);
    let externalId = asset.external_id;

    if (!externalId) {
      if (submitDelayMs > 0) await sleep(submitDelayMs);
      this.ctx.logger.info({ projectId, sceneId, kind, keyIndex }, 'submitting layer to 69labs');
      const submission = await gen.submit(req, keyIndex);
      externalId = submission.externalId;
      await this.ctx.repos.assets.setSubmitted(asset.id, {
        provider: 'sixtynine_labs',
        externalId,
      });
      await this.record(projectId, sceneId, asset.id, 'submit', externalId, 'submitted', null, null);
    } else {
      // Reconciling a PRIOR submission (this asset already has an externalId
      // from an earlier attempt). If that submission is older than the
      // reconcile budget, the job is presumed permanently wedged on 69Labs'
      // side (never reaching a terminal state) rather than just slow — give up
      // on it and force a fresh resubmit instead of polling it forever. Without
      // this, a truly stuck job loops: every retry re-polls the SAME dead
      // externalId for another full GENERATION_POLL_TIMEOUT_SEC, times out, and
      // repeats — burning all 6 BullMQ attempts without ever trying a new job.
      const submittedAgoMs = Date.now() - Date.parse(asset.updated_at);
      const reconcileBudgetMs = env.GENERATION_POLL_TIMEOUT_SEC * 1000 * RECONCILE_BUDGET_POLL_TIMEOUTS;
      if (submittedAgoMs > reconcileBudgetMs) {
        this.ctx.logger.error(
          { projectId, sceneId, kind, externalId, submittedAgoMs },
          '69labs job presumed wedged (exceeded reconcile budget); resubmitting fresh',
        );
        await this.ctx.repos.assets.clearGeneration(asset.id);
        throw new ExternalServiceError('69labs', 'generation wedged: exceeded reconcile budget', {
          retryable: true,
        });
      }
    }

    this.ctx.logger.info({ projectId, sceneId, kind, externalId, keyIndex }, 'awaiting 69labs generation');
    const result = await this.pollUntilTerminal(gen, externalId, keyIndex);

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

    // HAND-ANATOMY GATE (video/background only — overlays are bare products).
    // Inspect a frame of the just-generated clip for extra/deformed hands; if it
    // fails and we still have regen budget, discard it and force a fresh submit
    // with a bumped `regen` (new seed) so the retry differs. Once the budget is
    // exhausted we accept the last clip rather than fail the project — the render
    // has other guards, and a wedged scene is worse than one imperfect clip.
    if (kind === 'video' && env.HAND_CHECK_ENABLED) {
      let verdict: HandCheckOutput;
      try {
        const clip = await gen.download(result, keyIndex);
        verdict = await this.handCheck.check(clip);
      } catch (err) {
        // Same fail-open contract as HandCheckService.check itself: a download
        // hiccup (network blip, presigned URL already expired) is our
        // infrastructure flaking, not a verdict on the clip — never block the
        // project on it.
        this.ctx.logger.warn({ err, projectId, sceneId, slot }, 'hand-check: clip download failed; skipping (fail-open)');
        verdict = handCheckFailOpen('clip download failed');
      }
      if (!verdict.ok) {
        if (regen < env.HAND_CHECK_MAX_RETRIES) {
          this.ctx.logger.warn(
            { projectId, sceneId, slot, regen, verdict },
            'hand-check REJECTED clip; regenerating with a fresh seed',
          );
          await this.record(projectId, sceneId, asset.id, 'hand_check', externalId, 'rejected', null, verdict.reason);
          // Bump the persisted regen counter, then clear the generation so the
          // next runLayer entry submits fresh. Throw retryable so BullMQ re-runs.
          await this.ctx.repos.assets.updateMetadata(asset.id, { slot, regen: regen + 1 });
          await this.ctx.repos.assets.clearGeneration(asset.id);
          throw new ExternalServiceError('hand-check', `rejected: ${verdict.reason}`, { retryable: true });
        }
        this.ctx.logger.warn(
          { projectId, sceneId, slot, regen, verdict },
          'hand-check rejected but regen budget exhausted; accepting clip anyway',
        );
        await this.record(projectId, sceneId, asset.id, 'hand_check', externalId, 'accepted_over_budget', null, verdict.reason);
      }
    }

    await this.ctx.repos.assets.setGenerated(asset.id, result.resultUrl);
    await this.record(projectId, sceneId, asset.id, 'poll', externalId, 'completed', result.costUsd, null);
  }

  /**
   * Background layer, wide 16:9.
   * STORY-DRIVEN EVERYWHERE (client direction): every scene — product OR
   * full-frame breather — uses its OWN per-scene prompt + per-scene seed, so
   * each beat's environment is chosen from that scene's narration. The old
   * shared-interstitial prompt/seed path (all breathers recurring one
   * establishing look) is intentionally retired.
   */
  private backgroundRequest(
    projectId: string,
    sceneId: string,
    prompt: PromptRow,
    slot: number,
    regen = 0,
  ): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    const aspectRatio = asString(params.backgroundAspectRatio, PIP_LAYOUT.backgroundAspectRatio);
    // Each background sequence slot gets a DISTINCT seed so the back-to-back
    // clips aren't identical footage; slot 0 keeps the original seed so existing
    // single-clip projects reconcile to the same asset. `regen` (>0 on a
    // hand-check-triggered regeneration) further varies the seed so the retry is
    // different footage, not the same clip re-rolled. Same prompt across slots
    // keeps every clip in one continuous world/grade within the scene.
    const seedParts = [
      ...(slot === 0 ? [] : [String(slot)]),
      ...(regen > 0 ? [`r${regen}`] : []),
    ];
    return {
      // Lead every submission with the realism/physics/anatomy preamble so the
      // model obeys real-world physics before the scene description.
      prompt: withRealismPreamble(prompt.positive_prompt),
      // ALWAYS attach the anatomy/quality negative baseline — merged with the
      // scene's own negative when it has one. Never gate on the row having a
      // negative: a borrowed/legacy/model-omitted empty negative would otherwise
      // ship a clip with NO anti-"extra hands" guard at all — the exact hole that
      // lets the "three hands" video through. mergeNegativePrompt front-loads the
      // hand/limb-count terms even when the scene negative is blank.
      negativePrompt: mergeNegativePrompt(prompt.negative_prompt ?? ''),
      aspectRatio,
      seed: seedFrom(projectId, sceneId, 'video', ...seedParts),
    };
  }

  /**
   * Full-frame IMAGE scene: one wide 16:9 image that fills the whole screen (no
   * longer a portrait overlay window). Uses the scene's image prompt, falling
   * back to the (older) overlay prompt or the background prompt for projects
   * prompted before the full-frame-image format.
   */
  private fullFrameImageRequest(
    projectId: string,
    sceneId: string,
    prompt: PromptRow,
    slot = 0,
    regen = 0,
  ): GenerationRequest {
    const params = (prompt.parameters ?? {}) as Record<string, unknown>;
    const imagePrompt = asString(
      params.imagePrompt,
      asString(params.overlayPrompt, prompt.positive_prompt),
    );
    const imageNegative = asString(params.imageNegativePrompt, asString(params.overlayNegativePrompt, ''));
    // Each gallery slot gets a DISTINCT seed so the rotating stills aren't the
    // same frame; slot 0 keeps the original seed so existing single-image
    // projects reconcile to the same asset. `regen` (>0 on a hand-check retry)
    // varies it further so a regenerated still differs. Same prompt across slots
    // keeps every still in one continuous world/grade within the scene.
    const seedParts = [
      ...(slot === 0 ? [] : [String(slot)]),
      ...(regen > 0 ? [`r${regen}`] : []),
    ];
    return {
      prompt: withRealismPreamble(imagePrompt),
      // Always attach the anatomy/quality negative baseline (a full-frame image
      // can show a person, so the anti-"extra hands" guard still applies).
      negativePrompt: mergeNegativePrompt(imageNegative),
      // Full-frame image now matches the render orientation (wide), not a 3:4
      // portrait window.
      aspectRatio: PIP_LAYOUT.backgroundAspectRatio,
      seed: seedFrom(projectId, sceneId, 'image', ...seedParts),
    };
  }

  private async pollUntilTerminal(
    gen: GenerationService,
    externalId: string,
    keyIndex = 0,
  ): Promise<GenerationResult> {
    const deadline = Date.now() + env.GENERATION_POLL_TIMEOUT_SEC * 1000;
    let polls = 0;
    for (;;) {
      const result = await gen.poll(externalId, keyIndex);
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

/** Read an asset's hand-check regeneration count from metadata (default 0). */
function regenCountOf(asset: { metadata?: unknown }): number {
  const meta = (asset.metadata ?? {}) as Record<string, unknown>;
  const n = Number(meta.regen);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
