import {
  env,
  AssetKind,
  ProjectStatus,
  QueueName,
  ValidationError,
  NotFoundError,
  R2_PREFIX,
  SIGNED_URL_TTL,
  fileExtension,
  type CreateVoiceoverUploadInput,
} from '@yulia/core';
import type { ProjectRow } from '@yulia/db';
import type { SignedUpload } from '@yulia/services';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

export interface VoiceoverUploadTicket {
  assetId: string;
  upload: SignedUpload;
}

/**
 * Handles the voiceover upload handshake:
 *   1. `createVoiceoverUpload` — validate, create a pending asset row, return a
 *      signed PUT URL, and move the project CREATED -> UPLOADING_AUDIO.
 *   2. client PUTs the file directly to R2.
 *   3. `completeUpload` — confirm the object exists, mark the asset stored, and
 *      advance UPLOADING_AUDIO -> TRANSCRIBING (Phase 3 enqueues the job here).
 */
export class UploadService {
  private readonly projects: ProjectService;

  constructor(private readonly ctx: AppContext) {
    this.projects = new ProjectService(ctx);
  }

  async createVoiceoverUpload(
    ownerId: string,
    projectId: string,
    input: CreateVoiceoverUploadInput,
  ): Promise<VoiceoverUploadTicket> {
    const project = await this.projects.get(projectId, ownerId);
    if (project.status !== ProjectStatus.CREATED && project.status !== ProjectStatus.UPLOADING_AUDIO) {
      throw new ValidationError('Voiceover can only be uploaded on a new project', {
        status: project.status,
      });
    }

    const ext = fileExtension(input.filename) ?? mimeToExt(input.contentType);
    const asset = await this.ctx.repos.assets.create({
      projectId,
      kind: AssetKind.VOICEOVER,
      status: 'pending',
      contentType: input.contentType,
    });

    const key = R2_PREFIX.voiceover(projectId, asset.id, ext);
    const upload = await this.ctx.storage.createSignedUploadUrl({
      key,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      expiresInSec: SIGNED_URL_TTL.uploadSec,
    });

    // Record the intended key + submitted status on the asset.
    await this.ctx.repos.assets.updateStatus(asset.id, 'submitted');
    await this.ctx.sql`update assets set r2_bucket = ${env.R2_BUCKET}, r2_key = ${key} where id = ${asset.id}`;

    if (project.status === ProjectStatus.CREATED) {
      await this.projects.transition(projectId, ProjectStatus.UPLOADING_AUDIO);
    }

    return { assetId: asset.id, upload };
  }

  async completeUpload(ownerId: string, projectId: string, assetId: string): Promise<ProjectRow> {
    await this.projects.get(projectId, ownerId); // ownership guard
    const asset = await this.ctx.repos.assets.findById(assetId);
    if (!asset || asset.project_id !== projectId || asset.kind !== AssetKind.VOICEOVER) {
      throw new NotFoundError('Voiceover asset', assetId);
    }
    if (!asset.r2_key) throw new ValidationError('Asset has no storage key');

    const head = await this.ctx.storage.headObject(asset.r2_key);
    if (!head) {
      throw new ValidationError('Uploaded object not found in storage — did the PUT succeed?', {
        key: asset.r2_key,
      });
    }

    await this.ctx.repos.assets.markStored(assetId, {
      r2Bucket: asset.r2_bucket ?? env.R2_BUCKET,
      r2Key: asset.r2_key,
      contentType: head.contentType ?? asset.content_type ?? 'application/octet-stream',
      sizeBytes: head.size,
    });

    // Global 1-by-1 queue: start this project only if no other production is
    // currently generating; otherwise park it as `queued` (atomic under an
    // advisory lock, so two simultaneous uploads can't both start).
    const decision = await this.ctx.repos.projects.tryStartOrQueue(projectId);

    if (decision === 'queued') {
      const position = await this.ctx.repos.projects.queuePosition(projectId);
      await this.ctx.repos.activity.log({
        projectId,
        actorId: ownerId,
        type: 'audio_ready',
        message: `Voiceover uploaded; queued${position ? ` (position ${position})` : ''} — starts when the current production finishes`,
        data: position ? { queuePosition: position } : {},
      });
    } else {
      // Started now. Idempotent dispatch: ledger + BullMQ dedupe on the
      // deterministic key, so a double /complete call cannot enqueue twice.
      // The status flip above is committed, so a failed enqueue (e.g. Redis
      // unreachable) would otherwise strand the project in TRANSCRIBING with no
      // job — fail it instead (visible + retryable).
      try {
        await this.ctx.jobs.dispatch(QueueName.TRANSCRIPTION, { projectId, assetId }, { projectId });
      } catch (cause) {
        await this.projects
          .fail(projectId, {
            code: 'ENQUEUE_FAILED',
            message: 'Could not queue transcription — job broker unavailable',
          })
          .catch(() => undefined);
        throw cause;
      }
      await this.ctx.repos.activity.log({
        projectId,
        actorId: ownerId,
        type: 'audio_ready',
        message: 'Voiceover uploaded; transcription queued',
      });
    }

    const project = await this.ctx.repos.projects.findById(projectId);
    return project!;
  }
}

/** Fallback extension when a filename carries none. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
  };
  return map[mime] ?? 'bin';
}
