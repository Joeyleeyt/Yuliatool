import { QueueName } from '@yulia/core';
import { SceneGenerationService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function imageGenerationHandler(
  payload: QueuePayloadMap[typeof QueueName.IMAGE_GENERATION],
  ctx: AppContext,
): Promise<void> {
  // Scenes now fan out only to VIDEO_GENERATION (which drives both layers).
  // Kept for backward-compat with any in-flight IMAGE_GENERATION jobs; run() is
  // idempotent, so re-driving the scene is safe.
  await new SceneGenerationService(ctx).run(payload.projectId, payload.sceneId);
}
