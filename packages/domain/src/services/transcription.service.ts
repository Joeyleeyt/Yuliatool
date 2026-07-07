import {
  AssetKind,
  ProjectStatus,
  QueueName,
  NotFoundError,
  ValidationError,
  SIGNED_URL_TTL,
} from '@yulia/core';
import type { Json } from '@yulia/db';
import { DeepgramService, type SpeechToTextService } from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

/**
 * Transcription stage orchestration (runs inside the transcription worker).
 *
 * Idempotent + resumable: it only acts when the project is in TRANSCRIBING; a
 * re-delivered job for an already-advanced project is a no-op. On success it
 * persists the transcript, records cost/audit, advances to ANALYZING, and
 * dispatches the analysis stage.
 */
export class TranscriptionService {
  private readonly projects: ProjectService;
  private readonly stt: SpeechToTextService;

  constructor(
    private readonly ctx: AppContext,
    stt?: SpeechToTextService,
  ) {
    this.projects = new ProjectService(ctx);
    this.stt = stt ?? new DeepgramService();
  }

  async run(projectId: string): Promise<void> {
    const project = await this.ctx.repos.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    if (project.status !== ProjectStatus.TRANSCRIBING) {
      this.ctx.logger.info(
        { projectId, status: project.status },
        'transcription skipped (project not in TRANSCRIBING)',
      );
      return;
    }

    const voiceovers = await this.ctx.repos.assets.findByProject(projectId, AssetKind.VOICEOVER);
    const voiceover = voiceovers.find((a) => a.status === 'stored' && a.r2_key);
    if (!voiceover?.r2_key) {
      throw new ValidationError('No stored voiceover asset to transcribe', { projectId });
    }

    const url = await this.ctx.storage.createSignedDownloadUrl(
      voiceover.r2_key,
      SIGNED_URL_TTL.downloadSec,
    );

    const startedAt = Date.now();
    const result = await this.stt.transcribeUrl(url);
    const durationMs = Date.now() - startedAt;

    await this.ctx.repos.transcripts.upsertForProject(projectId, {
      provider: 'deepgram',
      language: result.language,
      durationSec: result.durationSec,
      fullText: result.fullText,
      words: result.words as unknown as Json,
      paragraphs: result.paragraphs as unknown as Json,
      raw: result.raw as Json,
    });

    await this.ctx.repos.generationHistory.record({
      projectId,
      assetId: voiceover.id,
      provider: 'deepgram',
      operation: 'transcribe',
      status: 'completed',
      durationMs,
      response: {
        language: result.language,
        durationSec: result.durationSec,
        wordCount: result.words.length,
        paragraphCount: result.paragraphs.length,
      } as unknown as Json,
    });

    await this.projects.transition(projectId, ProjectStatus.ANALYZING);
    await this.ctx.jobs.dispatch(QueueName.SCRIPT_ANALYSIS, { projectId }, { projectId });

    this.ctx.logger.info(
      { projectId, words: result.words.length, durationMs },
      'transcription complete; analysis dispatched',
    );
  }
}
