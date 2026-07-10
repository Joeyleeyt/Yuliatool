import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { QueueName, env } from '@yulia/core';
import { createQueueWorker } from '@yulia/queue';
import type { AppContext } from '@yulia/domain';
import { defineProcessor } from './runtime/run-processor.js';
import { transcriptionHandler } from './processors/transcription.js';
import { analysisHandler } from './processors/analysis.js';
import { promptGenerationHandler } from './processors/prompt-generation.js';
import { videoGenerationHandler } from './processors/video-generation.js';
import { imageGenerationHandler } from './processors/image-generation.js';
import { downloadAssetsHandler } from './processors/download-assets.js';
import { renderingHandler } from './processors/rendering.js';

/**
 * Register every queue's worker. Each stage is added here as it lands:
 *   Phase 3: transcription
 *   Phase 4: script-analysis, prompt-generation
 *   Phase 5: video-generation, image-generation, download-assets
 *   Phase 6: rendering
 */
export function registerProcessors(connection: Redis, ctx: AppContext): Worker[] {
  return [
    createQueueWorker(
      QueueName.TRANSCRIPTION,
      defineProcessor(QueueName.TRANSCRIPTION, transcriptionHandler, ctx),
      connection,
    ),
    createQueueWorker(
      QueueName.SCRIPT_ANALYSIS,
      defineProcessor(QueueName.SCRIPT_ANALYSIS, analysisHandler, ctx),
      connection,
    ),
    createQueueWorker(
      QueueName.PROMPT_GENERATION,
      defineProcessor(QueueName.PROMPT_GENERATION, promptGenerationHandler, ctx),
      connection,
    ),
    createQueueWorker(
      QueueName.VIDEO_GENERATION,
      defineProcessor(QueueName.VIDEO_GENERATION, videoGenerationHandler, ctx),
      connection,
      // Separate, lower-by-default cap: this is the one queue that hits 69Labs
      // directly (see VIDEO_GENERATION_CONCURRENCY doc in @yulia/core env).
      { concurrency: env.VIDEO_GENERATION_CONCURRENCY ?? env.WORKER_CONCURRENCY },
    ),
    createQueueWorker(
      QueueName.IMAGE_GENERATION,
      defineProcessor(QueueName.IMAGE_GENERATION, imageGenerationHandler, ctx),
      connection,
    ),
    createQueueWorker(
      QueueName.DOWNLOAD_ASSETS,
      defineProcessor(QueueName.DOWNLOAD_ASSETS, downloadAssetsHandler, ctx),
      connection,
    ),
    createQueueWorker(
      QueueName.RENDERING,
      defineProcessor(QueueName.RENDERING, renderingHandler, ctx),
      // Rendering is CPU/IO heavy; cap it to one concurrent render per worker.
      connection,
      { concurrency: 1 },
    ),
  ];
}
