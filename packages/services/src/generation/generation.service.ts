import { Readable } from 'node:stream';
import { ExternalServiceError } from '@yulia/core';
import { SixtyNineLabsClient } from './sixtynine-labs.client.js';
import type {
  GenerationKind,
  GenerationRequest,
  GenerationResult,
  GenerationService,
  GenerationSubmission,
} from './types.js';

/**
 * Base 69Labs generation service. Video/image differ only by `kind`. `submit`
 * and `poll` are thin; `download` streams the provider's result URL so callers
 * can pipe it straight to R2.
 */
abstract class SixtyNineLabsGenerationService implements GenerationService {
  abstract readonly kind: GenerationKind;

  constructor(protected readonly client: SixtyNineLabsClient = new SixtyNineLabsClient()) {}

  async submit(req: GenerationRequest): Promise<GenerationSubmission> {
    const gen = await this.client.createGeneration({
      type: this.kind,
      prompt: req.prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      aspect_ratio: req.aspectRatio,
      ...(req.durationSec !== undefined ? { duration: req.durationSec } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    });
    return { externalId: gen.id, status: gen.status };
  }

  async poll(externalId: string): Promise<GenerationResult> {
    const gen = await this.client.getGeneration(externalId);
    return {
      externalId: gen.id,
      status: gen.status,
      resultUrl: gen.resultUrl,
      costUsd: gen.costUsd,
      error: gen.error,
      raw: gen.raw,
    };
  }

  async download(result: GenerationResult): Promise<Readable> {
    if (!result.resultUrl) {
      throw new ExternalServiceError('69labs', 'no result URL to download', { retryable: false });
    }
    const res = await fetch(result.resultUrl);
    if (!res.ok || !res.body) {
      throw new ExternalServiceError('69labs', `download failed: ${res.status}`, {
        retryable: res.status >= 500,
      });
    }
    return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  }
}

export class VideoGenerationService extends SixtyNineLabsGenerationService {
  readonly kind = 'video' as const;
}

export class ImageGenerationService extends SixtyNineLabsGenerationService {
  readonly kind = 'image' as const;
}
