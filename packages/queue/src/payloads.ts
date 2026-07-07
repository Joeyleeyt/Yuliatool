import { z } from 'zod';
import { QueueName } from '@yulia/core';

/**
 * Typed job payloads — one Zod schema per queue. Producers validate before
 * enqueue; the worker wrapper validates on receive. Shared by both apps so an
 * enqueue and its consumer can never disagree on shape.
 */
const uuid = z.string().uuid();

export const TranscriptionPayloadSchema = z.object({ projectId: uuid, assetId: uuid });
export const ScriptAnalysisPayloadSchema = z.object({ projectId: uuid });
export const PromptGenerationPayloadSchema = z.object({ projectId: uuid });
export const VideoGenerationPayloadSchema = z.object({ projectId: uuid, sceneId: uuid });
export const ImageGenerationPayloadSchema = z.object({ projectId: uuid, sceneId: uuid });
export const DownloadAssetsPayloadSchema = z.object({ projectId: uuid, sceneId: uuid });
export const RenderingPayloadSchema = z.object({ projectId: uuid, renderId: uuid });
export const ThumbnailPayloadSchema = z.object({ projectId: uuid, renderId: uuid });

export const PAYLOAD_SCHEMAS = {
  [QueueName.TRANSCRIPTION]: TranscriptionPayloadSchema,
  [QueueName.SCRIPT_ANALYSIS]: ScriptAnalysisPayloadSchema,
  [QueueName.PROMPT_GENERATION]: PromptGenerationPayloadSchema,
  [QueueName.VIDEO_GENERATION]: VideoGenerationPayloadSchema,
  [QueueName.IMAGE_GENERATION]: ImageGenerationPayloadSchema,
  [QueueName.DOWNLOAD_ASSETS]: DownloadAssetsPayloadSchema,
  [QueueName.RENDERING]: RenderingPayloadSchema,
  [QueueName.THUMBNAIL]: ThumbnailPayloadSchema,
} as const satisfies Record<QueueName, z.ZodType>;

export interface QueuePayloadMap {
  [QueueName.TRANSCRIPTION]: z.infer<typeof TranscriptionPayloadSchema>;
  [QueueName.SCRIPT_ANALYSIS]: z.infer<typeof ScriptAnalysisPayloadSchema>;
  [QueueName.PROMPT_GENERATION]: z.infer<typeof PromptGenerationPayloadSchema>;
  [QueueName.VIDEO_GENERATION]: z.infer<typeof VideoGenerationPayloadSchema>;
  [QueueName.IMAGE_GENERATION]: z.infer<typeof ImageGenerationPayloadSchema>;
  [QueueName.DOWNLOAD_ASSETS]: z.infer<typeof DownloadAssetsPayloadSchema>;
  [QueueName.RENDERING]: z.infer<typeof RenderingPayloadSchema>;
  [QueueName.THUMBNAIL]: z.infer<typeof ThumbnailPayloadSchema>;
}
