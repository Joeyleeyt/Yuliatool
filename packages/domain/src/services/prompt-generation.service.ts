import {
  ProjectStatus,
  QueueName,
  mapLimit,
  NotFoundError,
  ValidationError,
  ScenePromptSchema,
  PIP_LAYOUT,
  assignImageWithWoman,
  env,
  type ScenePromptOutput,
} from '@yulia/core';
import type { Json, SceneRow } from '@yulia/db';
import { OpenAIService, type StructuredResult } from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';
import { seedFrom, scenePromptSystem, scenePromptUser, mergeNegativePrompt } from '../ai/index.js';

/**
 * PROMPT_GENERATION stage. Generates one cinematic 69Labs prompt per scene.
 *
 * Runs scenes in bounded-concurrency batches (PROMPT_GENERATION_CONCURRENCY) for
 * speed. Cross-scene continuity is anchored by the analysis's global style guide
 * + hard CONTINUITY ANCHORS (same woman, wardrobe, world, grade) plus each
 * scene's STATIC neighbor summaries — all known up front — rather than the
 * previous scene's live-generated prompt, which is what forced serialization.
 * On completion, advances to VIDEO_GENERATION and fans out per-scene generation
 * jobs (consumed in Phase 5).
 */
export class PromptGenerationService {
  private readonly projects: ProjectService;
  private readonly ai: OpenAIService;

  constructor(
    private readonly ctx: AppContext,
    ai?: OpenAIService,
  ) {
    this.projects = new ProjectService(ctx);
    // Prompt generation is many small structured calls — use the faster/cheaper
    // prompt model (falls back to OPENAI_MODEL when unset).
    this.ai = ai ?? new OpenAIService(undefined, env.OPENAI_PROMPT_MODEL ?? env.OPENAI_MODEL);
  }

  async run(projectId: string): Promise<void> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status !== ProjectStatus.PROMPT_GENERATION) {
      this.ctx.logger.info({ projectId, status: project.status }, 'prompt-gen skipped (wrong state)');
      return;
    }

    const analysis = await this.ctx.repos.analyses.findByProject(projectId);
    if (!analysis) throw new ValidationError('No analysis found', { projectId });

    const scenes = await this.ctx.repos.scenes.listByProject(projectId);
    if (scenes.length === 0) throw new ValidationError('No scenes to prompt', { projectId });

    const styleGuideJson = JSON.stringify(analysis.style_guide);
    const promptStrategyJson = JSON.stringify(analysis.prompt_strategy);
    const anchors = extractAnchors(analysis.continuity_memory);

    // Deterministically pick ~30% of the IMAGE scenes to FEATURE THE WOMAN (with
    // the object) instead of the object alone — client asked for more images with
    // women, since they were coming out object-only. Computed once over the whole
    // ordered scene list so the flagged stills are evenly spread, then each
    // scene's flag rides into its prompt.
    const imageWithWoman = assignImageWithWoman(scenes.map((s) => s.visual_type));

    const shared = { styleGuideJson, promptStrategyJson, anchors, total: scenes.length, imageWithWoman };

    // RESUME: skip scenes that already have a prompt. `mapLimit` rejects on the
    // first error, so ONE scene's transient failure (e.g. an OpenAI TPM 429 on a
    // long video) fails the whole batched job — and without this check the retry
    // would re-prompt ALL scenes from scratch, burning ~20 minutes and a fresh
    // round of tokens, which trips the rate limit again and can loop. Prompting is
    // per-scene independent, so a retry only needs the scenes still missing one.
    const prompted = new Set(
      (await this.ctx.repos.prompts.listActiveByProject(projectId)).map((p) => p.scene_id),
    );
    const pending = scenes.filter((s) => !prompted.has(s.id));

    this.ctx.logger.info(
      {
        projectId,
        scenes: scenes.length,
        pending: pending.length,
        skipped: scenes.length - pending.length,
        concurrency: env.PROMPT_GENERATION_CONCURRENCY,
      },
      'generating scene prompts (openai, batched)',
    );

    // Run the still-missing scenes with bounded concurrency. Each scene is
    // independent: continuity comes from the shared style guide + anchors + static
    // neighbor summaries, not from other scenes' generated prompts. Index by the
    // scene's position in the FULL list so neighbor context stays correct.
    const indexOf = new Map(scenes.map((s, i) => [s.id, i]));
    await mapLimit(pending, env.PROMPT_GENERATION_CONCURRENCY, (scene) =>
      this.promptScene(projectId, scenes, indexOf.get(scene.id)!, shared),
    );

    await this.projects.transition(projectId, ProjectStatus.VIDEO_GENERATION);
    await this.fanOutGeneration(projectId, scenes);

    this.ctx.logger.info({ projectId, prompts: scenes.length }, 'prompt generation complete');
  }

  /** Generate + persist the prompt for a single scene (index `i`). */
  private async promptScene(
    projectId: string,
    scenes: SceneRow[],
    i: number,
    shared: {
      styleGuideJson: string;
      promptStrategyJson: string;
      anchors: string[];
      total: number;
      imageWithWoman: boolean[];
    },
  ): Promise<void> {
    const scene = scenes[i]!;
    const prevScene = scenes[i - 1] ?? null;
    const next = scenes[i + 1] ?? null;
    const brief = (scene.visual_brief ?? {}) as Record<string, unknown>;

    this.ctx.logger.info(
      { projectId, sceneId: scene.id, scene: i + 1, total: shared.total, visualType: scene.visual_type },
      'prompting scene',
    );

    // Static continuity: reference the previous scene's title + summary (known
    // up front) rather than its generated prompt, so scenes parallelize. The
    // hard anchors above still bind the shared subject/wardrobe/world/grade.
    const previous = prevScene
      ? {
          title: prevScene.title ?? `Scene ${i}`,
          positivePrompt: prevScene.summary ?? prevScene.title ?? `Scene ${i}`,
        }
      : null;

    const result: StructuredResult<ScenePromptOutput> = await this.ai.complete<ScenePromptOutput>({
      schema: ScenePromptSchema,
      schemaName: 'scene_prompt',
      system: scenePromptSystem(scene.visual_type),
      user: scenePromptUser({
        index: i,
        total: shared.total,
        styleGuideJson: shared.styleGuideJson,
        promptStrategyJson: shared.promptStrategyJson,
        anchors: shared.anchors,
        current: {
          title: scene.title ?? `Scene ${i + 1}`,
          summary: scene.summary ?? '',
          narration: scene.narration_text ?? '',
          visualIntent: String(brief.visualIntent ?? ''),
          subject: String(brief.subject ?? ''),
          environment: String(brief.environment ?? ''),
          mood: String(brief.mood ?? ''),
          continuityNotes: scene.continuity_notes ?? '',
        },
        previous,
        next: next ? { title: next.title ?? '', summary: next.summary ?? '' } : null,
        // This IMAGE scene's still should feature the woman with the object
        // (rather than the object alone) — see assignImageWithWoman.
        imageFeaturesWoman: shared.imageWithWoman[i] ?? false,
      }),
      temperature: 0.6,
      seed: seedFrom(projectId, scene.id),
    });

    const negative = mergeNegativePrompt(result.data.negativePrompt);
    // Store both PiP layers in one prompt row: the background lives in the
    // top-level positive/negative fields; the overlay prompt + its aspect
    // ratio ride in `parameters` (consumed by the two-layer generation stage).
    // `interstitialPrompt` is the SHARED recurring-establishing background used
    // by full-frame (video-only) scenes — identical on every scene (derived
    // from the project-wide anchors, not this scene) so those beats reuse one
    // recurring look.
    const parameters: Json = {
      backgroundAspectRatio: PIP_LAYOUT.backgroundAspectRatio,
      overlayAspectRatio: PIP_LAYOUT.overlayAspectRatio,
      overlayPrompt: result.data.overlayPrompt,
      overlayNegativePrompt: mergeNegativePrompt(result.data.overlayNegativePrompt),
      // Second rotated-overlay prompt for longer scenes (optional; falls back to
      // the primary when absent). Same shared negative baseline.
      ...(result.data.overlayPrompt2
        ? { overlayPrompt2: result.data.overlayPrompt2 }
        : {}),
      // Overlay EDITING PLAN (position / motion / transition). Persisted only
      // when the model chose a value; the renderer falls back to the
      // deterministic side + soft-zoom defaults for scenes prompted before these
      // fields existed (see resolveOverlayPosition / OVERLAY_MOTION_DEFAULT).
      ...(result.data.overlayPosition ? { overlayPosition: result.data.overlayPosition } : {}),
      ...(result.data.overlayMotion ? { overlayMotion: result.data.overlayMotion } : {}),
      ...(result.data.overlayMotion2 ? { overlayMotion2: result.data.overlayMotion2 } : {}),
      ...(result.data.overlayTransition ? { overlayTransition: result.data.overlayTransition } : {}),
      interstitialPrompt: interstitialPrompt(shared.anchors),
      camera: result.data.camera,
      composition: result.data.composition,
      lighting: result.data.lighting,
      motion: result.data.motion,
      colorPalette: result.data.colorPalette,
    };

    await this.ctx.repos.prompts.createVersion({
      sceneId: scene.id,
      projectId,
      model: env.OPENAI_PROMPT_MODEL ?? env.OPENAI_MODEL,
      positivePrompt: result.data.positivePrompt,
      negativePrompt: negative,
      parameters,
    });

    await this.ctx.repos.generationHistory.record({
      projectId,
      sceneId: scene.id,
      provider: 'openai',
      operation: 'prompt',
      status: 'completed',
      response: (result.usage ?? {}) as unknown as Json,
    });
  }

  /**
   * Dispatch one generation job per scene. Each scene is a two-layer composite,
   * so a single VIDEO_GENERATION job drives BOTH the background video and the
   * overlay image (see SceneGenerationService) — no separate image fan-out.
   */
  private async fanOutGeneration(projectId: string, scenes: SceneRow[]): Promise<void> {
    // Dispatch is per-scene DB read + write + Redis enqueue. Fan them out in a
    // bounded pool so the whole enqueue completes in ~one round-trip's time
    // instead of one scene at a time (pure latency at this stage boundary).
    await mapLimit(scenes, env.PROMPT_GENERATION_CONCURRENCY, (scene) =>
      this.ctx.jobs.dispatch(
        QueueName.VIDEO_GENERATION,
        { projectId, sceneId: scene.id },
        { projectId, sceneId: scene.id },
      ),
    );
  }
}

/**
 * Build the SHARED recurring-interstitial background prompt: a quiet, motion-
 * light establishing shot bound to the project's continuity anchors so it reads
 * as the same recurring world each time a full-frame breather scene appears.
 * Deterministic (same anchors -> same string) so every scene stores the exact
 * same value, and the generation stage's shared seed yields recurring footage.
 */
function interstitialPrompt(anchors: string[]): string {
  const world = anchors.length ? ` featuring ${anchors.join(', ')}` : '';
  return (
    `Cinematic wide establishing shot of a serene, sunlit quiet-luxury interior${world}. ` +
    `Soft natural window light, warm champagne-and-ivory palette, shallow depth of field, ` +
    `slow gentle camera drift, calm and editorial. No people in frame, no text, no logos.`
  );
}

function extractAnchors(continuityMemory: unknown): string[] {
  if (continuityMemory && typeof continuityMemory === 'object' && 'anchors' in continuityMemory) {
    const anchors = (continuityMemory as { anchors: unknown }).anchors;
    if (Array.isArray(anchors)) return anchors.map((a) => String(a));
  }
  return [];
}
