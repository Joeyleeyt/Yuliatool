import {
  ProjectStatus,
  QueueName,
  NotFoundError,
  ValidationError,
  AnalysisSchema,
  SegmentationSchema,
  visualTypeForIndex,
  env,
  type SegmentScene,
} from '@yulia/core';
import type { Json, NewScene } from '@yulia/db';
import { OpenAIService } from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';
import {
  buildTranscriptUnits,
  seedFrom,
  analysisSystem,
  analysisUser,
  segmentationSystem,
  segmentationUser,
  type TranscriptUnit,
  type WordLike,
  type ParagraphLike,
} from '../ai/index.js';

/**
 * Combined ANALYZING + SEGMENTING stage (both map to the script-analysis queue).
 * Produces the global analysis and the grounded scene timeline, then advances
 * to PROMPT_GENERATION. Idempotent: re-running replaces the analysis + scenes.
 */
export class AnalysisService {
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

    if (
      project.status !== ProjectStatus.ANALYZING &&
      project.status !== ProjectStatus.SEGMENTING
    ) {
      this.ctx.logger.info({ projectId, status: project.status }, 'analysis skipped (wrong state)');
      return;
    }

    const transcript = await this.ctx.repos.transcripts.findByProject(projectId);
    if (!transcript?.full_text) throw new ValidationError('No transcript to analyze', { projectId });

    const units = buildTranscriptUnits(
      transcript.words as unknown as WordLike[],
      transcript.paragraphs as unknown as ParagraphLike[],
    );
    if (units.length === 0) throw new ValidationError('Transcript produced no units', { projectId });

    // --- Stage 1: global analysis ---
    const analysis = await this.ai.complete({
      schema: AnalysisSchema,
      schemaName: 'analysis',
      system: analysisSystem(),
      user: analysisUser(transcript.full_text),
      temperature: 0.5,
      seed: seedFrom(projectId, 'analysis'),
    });

    await this.ctx.repos.analyses.upsertForProject(projectId, {
      model: env.OPENAI_MODEL,
      summary: analysis.data.summary,
      emotionalArc: analysis.data.emotionalArc as unknown as Json,
      visualMotifs: analysis.data.visualMotifs as unknown as Json,
      styleGuide: analysis.data.styleGuide as unknown as Json,
      promptStrategy: analysis.data.promptStrategy as unknown as Json,
      continuityMemory: { anchors: analysis.data.continuityAnchors } as unknown as Json,
      raw: analysis.data as unknown as Json,
    });
    await this.recordAI(projectId, 'analyze', analysis.usage);

    if (project.status === ProjectStatus.ANALYZING) {
      await this.projects.transition(projectId, ProjectStatus.SEGMENTING);
    }

    // --- Stage 2: segmentation ---
    const segmentation = await this.ai.complete({
      schema: SegmentationSchema,
      schemaName: 'segmentation',
      system: segmentationSystem(),
      user: segmentationUser(
        units,
        JSON.stringify(analysis.data.styleGuide),
        analysis.data.visualMotifs,
        analysis.data.continuityAnchors,
      ),
      temperature: 0.3,
      seed: seedFrom(projectId, 'segment'),
    });

    const scenes = buildScenes(units, segmentation.data.scenes);
    if (scenes.length === 0) throw new ValidationError('Segmentation produced no scenes', { projectId });

    const rows = await this.ctx.repos.scenes.replaceForProject(projectId, scenes);
    await this.ctx.repos.projects.setSceneTotals(projectId, rows.length);
    await this.recordAI(projectId, 'segment', segmentation.usage);

    await this.projects.transition(projectId, ProjectStatus.PROMPT_GENERATION);
    await this.ctx.jobs.dispatch(QueueName.PROMPT_GENERATION, { projectId }, { projectId });

    this.ctx.logger.info({ projectId, scenes: rows.length }, 'analysis + segmentation complete');
  }

  private async recordAI(
    projectId: string,
    operation: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
  ): Promise<void> {
    await this.ctx.repos.generationHistory.record({
      projectId,
      provider: 'openai',
      operation,
      status: 'completed',
      response: (usage ?? {}) as unknown as Json,
    });
  }
}

/**
 * Convert LLM scene groupings into persistable scenes: clamp indices to valid
 * units, derive real timings, assign the alternating visual type, and reindex.
 */
function buildScenes(units: TranscriptUnit[], segScenes: SegmentScene[]): NewScene[] {
  const maxIdx = units.length - 1;
  const ordered = [...segScenes].sort((a, b) => a.startIndex - b.startIndex);

  return ordered.map((s, i): NewScene => {
    let startIdx = clamp(s.startIndex, 0, maxIdx);
    let endIdx = clamp(s.endIndex, 0, maxIdx);
    if (endIdx < startIdx) [startIdx, endIdx] = [endIdx, startIdx];

    const startSec = units[startIdx]!.start;
    const endSec = units[endIdx]!.end;
    const durationSec = Math.max(0.5, Number((endSec - startSec).toFixed(3)));
    const narration = units
      .slice(startIdx, endIdx + 1)
      .map((u) => u.text)
      .join(' ');
    const visualType = visualTypeForIndex(i);

    const visualBrief: Json = {
      visualIntent: s.visualIntent,
      subject: s.subject,
      environment: s.environment,
      mood: s.mood,
    };

    return {
      sceneIndex: i,
      visualType,
      startSec,
      endSec: Math.max(endSec, startSec),
      durationSec,
      title: s.title,
      summary: s.summary,
      narrationText: narration,
      visualBrief,
      continuityNotes: s.continuityNotes,
    };
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(v), min), max);
}
