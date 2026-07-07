import { QueueName } from '@yulia/core';
import { PromptGenerationService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function promptGenerationHandler(
  payload: QueuePayloadMap[typeof QueueName.PROMPT_GENERATION],
  ctx: AppContext,
): Promise<void> {
  await new PromptGenerationService(ctx).run(payload.projectId);
}
