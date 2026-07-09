import { QueueName } from '@yulia/core';
import { SceneGenerationService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function videoGenerationHandler(
  payload: QueuePayloadMap[typeof QueueName.VIDEO_GENERATION],
  ctx: AppContext,
): Promise<void> {
  // Drives BOTH layers of the scene (background video + overlay image).
  await new SceneGenerationService(ctx).run(payload.projectId, payload.sceneId);
}
