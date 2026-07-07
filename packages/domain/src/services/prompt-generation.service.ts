import {
  ProjectStatus,
  QueueName,
  SceneVisualType,
  NotFoundError,
  ValidationError,
  ScenePromptSchema,
  SEGMENT_DURATION,
  env,
  type ScenePromptOutput,
} from '@yulia/core';
import type { Json, SceneRow } from '@yulia/db';
import { OpenAIService, type StructuredResult } from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';
import {
  seedFrom,
  scenePromptSystem,
  scenePromptUser,
  mergeNegativePrompt,
  aspectRatioFor,
} from '../ai/index.js';

/**
 * PROMPT_GENERATION stage. Generates one cinematic 69Labs prompt per scene,
 * *sequentially*, feeding each call the global style + previous scene's prompt +
 * next scene's summary so continuity holds across the whole timeline. On
 * completion, advances to VIDEO_GENERATION and fans out per-scene generation
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
    this.ai = ai ?? new OpenAIService();
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

    let previous: { title: string; positivePrompt: string } | null = null;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]!;
      const next = scenes[i + 1] ?? null;
      const brief = (scene.visual_brief ?? {}) as Record<string, unknown>;

      const result: StructuredResult<ScenePromptOutput> = await this.ai.complete<ScenePromptOutput>({
        schema: ScenePromptSchema,
        schemaName: 'scene_prompt',
        system: scenePromptSystem(scene.visual_type),
        user: scenePromptUser({
          index: i,
          total: scenes.length,
          styleGuideJson,
          promptStrategyJson,
          anchors,
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
        }),
        temperature: 0.6,
        seed: seedFrom(projectId, scene.id),
      });

      const negative = mergeNegativePrompt(result.data.negativePrompt);
      const parameters: Json = {
        visualType: scene.visual_type,
        aspectRatio: aspectRatioFor(project.render_format),
        durationSec: SEGMENT_DURATION[scene.visual_type],
        camera: result.data.camera,
        composition: result.data.composition,
        lighting: result.data.lighting,
        motion: result.data.motion,
        colorPalette: result.data.colorPalette,
      };

      await this.ctx.repos.prompts.createVersion({
        sceneId: scene.id,
        projectId,
        model: env.OPENAI_MODEL,
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

      previous = { title: scene.title ?? `Scene ${i + 1}`, positivePrompt: result.data.positivePrompt };
    }

    await this.projects.transition(projectId, ProjectStatus.VIDEO_GENERATION);
    await this.fanOutGeneration(projectId, scenes);

    this.ctx.logger.info({ projectId, prompts: scenes.length }, 'prompt generation complete');
  }

  /** Dispatch one generation job per scene by visual type (consumed in Phase 5). */
  private async fanOutGeneration(projectId: string, scenes: SceneRow[]): Promise<void> {
    for (const scene of scenes) {
      const queue =
        scene.visual_type === SceneVisualType.VIDEO
          ? QueueName.VIDEO_GENERATION
          : QueueName.IMAGE_GENERATION;
      await this.ctx.jobs.dispatch(
        queue,
        { projectId, sceneId: scene.id },
        { projectId, sceneId: scene.id },
      );
    }
  }
}

function extractAnchors(continuityMemory: unknown): string[] {
  if (continuityMemory && typeof continuityMemory === 'object' && 'anchors' in continuityMemory) {
    const anchors = (continuityMemory as { anchors: unknown }).anchors;
    if (Array.isArray(anchors)) return anchors.map((a) => String(a));
  }
  return [];
}
