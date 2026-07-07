import { QueueName } from '@yulia/core';
import { DownloadAssetsService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function downloadAssetsHandler(
  payload: QueuePayloadMap[typeof QueueName.DOWNLOAD_ASSETS],
  ctx: AppContext,
): Promise<void> {
  await new DownloadAssetsService(ctx).run(payload.projectId, payload.sceneId);
}
