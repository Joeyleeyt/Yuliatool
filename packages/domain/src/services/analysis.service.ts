import {
  ProjectStatus,
  QueueName,
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  AnalysisSchema,
  SegmentationSchema,
  SEGMENT_WINDOW_SEC,
  SEGMENTATION_CHUNK,
  assignVisualTypes,
  env,
  type SegmentScene,
  type SegmentationOutput,
} from '@yulia/core';
import type { Json, NewScene } from '@yulia/db';
import { OpenAIService, type StructuredResult } from '@yulia/services';
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
    this.ctx.logger.info({ projectId, units: units.length }, 'analyzing transcript (openai)');
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
      // Carry the detected SUBJECT alongside anchors so every scene prompt knows
      // who/what is on screen (woman / man / both / none) instead of assuming a
      // woman. Rides continuity_memory — the same channel scene prompts already read.
      continuityMemory: {
        anchors: analysis.data.continuityAnchors,
        subject: analysis.data.subject,
      } as unknown as Json,
      raw: analysis.data as unknown as Json,
    });
    await this.recordAI(projectId, 'analyze', analysis.usage);

    if (project.status === ProjectStatus.ANALYZING) {
      await this.projects.transition(projectId, ProjectStatus.SEGMENTING);
    }

    // --- Stage 2: segmentation ---
    // Chunked into multiple OpenAI calls (see SEGMENTATION_CHUNK) so a long
    // transcript never asks one response to emit the whole scene list — that
    // silently truncates against the model's max output tokens (a truncated-but-
    // syntactically-valid partial array used to be accepted as "done", see
    // OpenAIService's finish_reason check).
    this.ctx.logger.info({ projectId, units: units.length }, 'segmenting transcript into scenes (openai)');
    const unitChunks = chunkUnits(units);
    const segScenes: SegmentScene[] = [];
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let precedingLastTitle: string | null = null;

    for (let c = 0; c < unitChunks.length; c++) {
      const chunk = unitChunks[c]!;
      const precedingChunk = c > 0 ? unitChunks[c - 1]! : null;
      const precedingText = precedingChunk
        ? precedingChunk
            .slice(-SEGMENTATION_CHUNK.overlapUnits)
            .map((u) => u.text)
            .join(' ')
        : null;

      const segmentation: StructuredResult<SegmentationOutput> = await this.ai.complete({
        schema: SegmentationSchema,
        schemaName: 'segmentation',
        system: segmentationSystem(),
        user: segmentationUser(
          chunk,
          JSON.stringify(analysis.data.styleGuide),
          analysis.data.visualMotifs,
          analysis.data.continuityAnchors,
          {
            chunkIndex: c + 1,
            chunkTotal: unitChunks.length,
            precedingText,
            precedingLastTitle,
          },
        ),
        temperature: 0.3,
        seed: seedFrom(projectId, 'segment', String(c)),
      });

      segScenes.push(...segmentation.data.scenes);
      const lastScene = segmentation.data.scenes.at(-1);
      if (lastScene) precedingLastTitle = lastScene.title;
      if (segmentation.usage) {
        totalUsage = {
          promptTokens: totalUsage.promptTokens + segmentation.usage.promptTokens,
          completionTokens: totalUsage.completionTokens + segmentation.usage.completionTokens,
          totalTokens: totalUsage.totalTokens + segmentation.usage.totalTokens,
        };
      }
    }

    const scenes = buildScenes(units, segScenes);
    if (scenes.length === 0) throw new ValidationError('Segmentation produced no scenes', { projectId });

    // Guard against silent partial coverage (the original failure mode): if the
    // scenes don't reach the end of the transcript, something upstream dropped
    // data — fail loudly (retryable) instead of completing a truncated video.
    const transcriptEndSec = units[units.length - 1]!.end;
    const scenesEndSec = scenes[scenes.length - 1]!.endSec;
    const coverageGapSec = transcriptEndSec - scenesEndSec;
    if (coverageGapSec > SEGMENT_WINDOW_SEC.split) {
      throw new ExternalServiceError(
        'openai',
        `segmentation covers only ${scenesEndSec.toFixed(1)}s of ${transcriptEndSec.toFixed(1)}s ` +
          `of transcript (gap ${coverageGapSec.toFixed(1)}s)`,
        { retryable: true },
      );
    }

    const rows = await this.ctx.repos.scenes.replaceForProject(projectId, scenes);
    await this.ctx.repos.projects.setSceneTotals(projectId, rows.length);
    await this.recordAI(projectId, 'segment', totalUsage);

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
 * Split transcript units into contiguous windows of ~SEGMENTATION_CHUNK.
 * targetWindowSec each, so segmentation never has to ask one OpenAI call to
 * emit scenes for the whole transcript at once (see SEGMENTATION_CHUNK doc).
 * Splits happen at unit boundaries only — every unit belongs to exactly one
 * chunk, so the chunks partition `units` with no gaps or overlaps.
 */
function chunkUnits(units: TranscriptUnit[]): TranscriptUnit[][] {
  if (units.length === 0) return [];
  const chunks: TranscriptUnit[][] = [];
  let current: TranscriptUnit[] = [];
  let windowStartSec = units[0]!.start;

  for (const unit of units) {
    if (
      current.length > 0 &&
      unit.end - windowStartSec > SEGMENTATION_CHUNK.targetWindowSec
    ) {
      chunks.push(current);
      current = [];
      windowStartSec = unit.start;
    }
    current.push(unit);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** A contiguous transcript-unit range that will become one persisted scene. */
interface SceneSpan {
  startIdx: number;
  endIdx: number;
  seg: SegmentScene;
}

/**
 * Convert LLM scene groupings into persistable scenes. The model returns coarse
 * topic ranges; here we (1) clamp + order them, (2) HARD-SPLIT any range longer
 * than SEGMENT_WINDOW_SEC.split into ~target-second sub-scenes so the cadence is
 * enforced regardless of what the model returned, then (3) derive real timings
 * and assign the overlay treatment over the final expanded list.
 */
function buildScenes(units: TranscriptUnit[], segScenes: SegmentScene[]): NewScene[] {
  const maxIdx = units.length - 1;
  const ordered = [...segScenes].sort((a, b) => a.startIndex - b.startIndex);

  // Pass 1: normalize ranges and split oversized ones into sub-spans.
  const spans: SceneSpan[] = [];
  for (const seg of ordered) {
    let startIdx = clamp(seg.startIndex, 0, maxIdx);
    let endIdx = clamp(seg.endIndex, 0, maxIdx);
    if (endIdx < startIdx) [startIdx, endIdx] = [endIdx, startIdx];
    spans.push(...splitSpan(units, startIdx, endIdx, seg));
  }

  // Pass 2: materialize each span. Visual type is assigned over the FINAL
  // (post-split) list: each window hits a target video/image RATIO (more video
  // early, less after VISUAL_TAPER_SEC — video credits are scarce), and image
  // slots prefer beats whose narration names a showable thing (see
  // assignVisualTypes). `sceneStarts` lets it pick the opening-vs-body ratio.
  const narrations = spans.map((span) =>
    units
      .slice(span.startIdx, span.endIdx + 1)
      .map((u) => u.text)
      .join(' '),
  );
  const sceneStarts = spans.map((span) => units[span.startIdx]!.start);
  const visualTypes = assignVisualTypes(narrations, sceneStarts);

  return spans.map((span, i): NewScene => {
    const startSec = units[span.startIdx]!.start;
    const endSec = units[span.endIdx]!.end;
    const durationSec = Math.max(0.5, Number((endSec - startSec).toFixed(3)));
    const narration = narrations[i]!;
    const visualType = visualTypes[i]!;

    const visualBrief: Json = {
      visualIntent: span.seg.visualIntent,
      subject: span.seg.subject,
      environment: span.seg.environment,
      mood: span.seg.mood,
    };

    return {
      sceneIndex: i,
      visualType,
      startSec,
      endSec: Math.max(endSec, startSec),
      durationSec,
      title: span.seg.title,
      summary: span.seg.summary,
      narrationText: narration,
      visualBrief,
      continuityNotes: span.seg.continuityNotes,
    };
  });
}

/**
 * Split a unit range [startIdx..endIdx] into contiguous sub-spans each aiming
 * for ~SEGMENT_WINDOW_SEC.target seconds, so no scene exceeds `.split`. Splits
 * happen at unit boundaries (timings stay grounded, no gaps/overlaps). A range
 * already within the bound is returned as a single span. All sub-spans inherit
 * the parent segment's title/summary/brief (they're the same topic beat).
 */
function splitSpan(
  units: TranscriptUnit[],
  startIdx: number,
  endIdx: number,
  seg: SegmentScene,
): SceneSpan[] {
  const total = units[endIdx]!.end - units[startIdx]!.start;
  if (total <= SEGMENT_WINDOW_SEC.split || endIdx <= startIdx) {
    return [{ startIdx, endIdx, seg }];
  }

  const parts = Math.max(2, Math.ceil(total / SEGMENT_WINDOW_SEC.target));
  const spans: SceneSpan[] = [];
  let cursor = startIdx;
  for (let p = 0; p < parts && cursor <= endIdx; p++) {
    // Grow the chunk unit-by-unit until it reaches the target length, leaving at
    // least one unit for each remaining part so we don't overrun the range.
    const chunkStartSec = units[cursor]!.start;
    let last = cursor;
    const maxLastForPart = endIdx - (parts - 1 - p); // reserve units for later parts
    while (
      last < maxLastForPart &&
      units[last]!.end - chunkStartSec < SEGMENT_WINDOW_SEC.target
    ) {
      last++;
    }
    // Final part always extends to the end.
    if (p === parts - 1) last = endIdx;
    spans.push({ startIdx: cursor, endIdx: last, seg });
    cursor = last + 1;
  }
  // Any leftover units (rounding) fold into the last span.
  if (cursor <= endIdx && spans.length > 0) spans[spans.length - 1]!.endIdx = endIdx;
  return spans;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(v), min), max);
}
