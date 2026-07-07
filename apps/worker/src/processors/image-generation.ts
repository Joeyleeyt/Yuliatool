import { QueueName } from '@yulia/core';
import { SceneGenerationService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function imageGenerationHandler(
  payload: QueuePayloadMap[typeof QueueName.IMAGE_GENERATION],
  ctx: AppContext,
): Promise<void> {
  await new SceneGenerationService(ctx).run(payload.projectId, payload.sceneId, 'image');
}
