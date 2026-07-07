import { QueueName } from '@yulia/core';
import { TranscriptionService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function transcriptionHandler(
  payload: QueuePayloadMap[typeof QueueName.TRANSCRIPTION],
  ctx: AppContext,
): Promise<void> {
  await new TranscriptionService(ctx).run(payload.projectId);
}
