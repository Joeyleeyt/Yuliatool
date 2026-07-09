import type { Readable } from 'node:stream';
import { env, ExternalServiceError } from '@yulia/core';
import { SixtyNineLabsClient, type CreateGenerationBody } from './sixtynine-labs.client.js';
import type {
  GenerationKind,
  GenerationRequest,
  GenerationResult,
  GenerationService,
  GenerationSubmission,
} from './types.js';

/**
 * Base 69Labs generation service. Video/image differ by `kind` (which selects
 * the /videos or /images endpoints) and by which request fields the provider
 * accepts (`buildBody`). `submit` and `poll` are thin; `download` streams the
 * job's output via the provider's authenticated download endpoint.
 */
abstract class SixtyNineLabsGenerationService implements GenerationService {
  abstract readonly kind: GenerationKind;

  constructor(protected readonly client: SixtyNineLabsClient = new SixtyNineLabsClient()) {}

  /** Map our normalized request onto the fields this kind's endpoint accepts. */
  protected abstract buildBody(req: GenerationRequest): CreateGenerationBody;

  async submit(req: GenerationRequest): Promise<GenerationSubmission> {
    const gen = await this.client.createGeneration(this.kind, this.buildBody(req));
    return { externalId: gen.id, status: gen.status };
  }

  async poll(externalId: string): Promise<GenerationResult> {
    const gen = await this.client.getGeneration(this.kind, externalId);
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
    if (!result.externalId) {
      throw new ExternalServiceError('69labs', 'no job id to download', { retryable: false });
    }
    return this.client.download(this.kind, result.externalId);
  }
}

export class VideoGenerationService extends SixtyNineLabsGenerationService {
  readonly kind = 'video' as const;

  protected buildBody(req: GenerationRequest): CreateGenerationBody {
    return {
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      ...(env.SIXTYNINE_LABS_VIDEO_MODEL ? { model: env.SIXTYNINE_LABS_VIDEO_MODEL } : {}),
      // Duration is off by default: the account's default model (Veo 3.1 Lite)
      // rejects duration selection. Enable SIXTYNINE_LABS_VIDEO_DURATION only
      // with a model that supports it. `seed`/negative prompts aren't supported
      // on video jobs.
      ...(env.SIXTYNINE_LABS_VIDEO_DURATION && req.durationSec !== undefined
        ? { duration: String(req.durationSec) }
        : {}),
    };
  }
}

export class ImageGenerationService extends SixtyNineLabsGenerationService {
  readonly kind = 'image' as const;

  protected buildBody(req: GenerationRequest): CreateGenerationBody {
    return {
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      ...(env.SIXTYNINE_LABS_IMAGE_MODEL ? { model: env.SIXTYNINE_LABS_IMAGE_MODEL } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    };
  }
}
