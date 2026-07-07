import { QueueName } from '@yulia/core';
import { RenderService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function renderingHandler(
  payload: QueuePayloadMap[typeof QueueName.RENDERING],
  ctx: AppContext,
): Promise<void> {
  await new RenderService(ctx).run(payload.projectId, payload.renderId);
}
