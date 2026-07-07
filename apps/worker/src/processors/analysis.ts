import { QueueName } from '@yulia/core';
import { AnalysisService, type AppContext } from '@yulia/domain';
import type { QueuePayloadMap } from '@yulia/queue';

export async function analysisHandler(
  payload: QueuePayloadMap[typeof QueueName.SCRIPT_ANALYSIS],
  ctx: AppContext,
): Promise<void> {
  await new AnalysisService(ctx).run(payload.projectId);
}
