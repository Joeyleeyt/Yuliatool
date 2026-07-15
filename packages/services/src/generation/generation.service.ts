import type { Readable } from 'node:stream';
import { env, ExternalServiceError, createLogger } from '@yulia/core';
import { SixtyNineLabsClient, type CreateGenerationBody } from './sixtynine-labs.client.js';
import { CreditThrottle } from './credit-throttle.js';
import type {
  GenerationKind,
  GenerationRequest,
  GenerationResult,
  GenerationService,
  GenerationSubmission,
} from './types.js';

const throttleLog = createLogger({ component: 'credit-throttle' });

/**
 * One shared credit throttle per kind, per worker process. Sharing across all
 * concurrent scenes in this instance means they pace against ONE view of the
 * remaining budget (rather than each fetching/reserving independently); every
 * instance reads the same provider-side counter, so pacing stays correct across
 * machines too. Lazily created so a process that never generates (e.g. web)
 * doesn't build one.
 */
// One throttle per (kind, key). Each key is a separate 69Labs account with its
// OWN credit window, so budget must be paced per account, not globally.
const throttles: Record<string, CreditThrottle> = {};
function throttleFor(
  kind: GenerationKind,
  keyIndex: number,
  client: SixtyNineLabsClient,
): CreditThrottle {
  const id = `${kind}:${keyIndex}`;
  return (throttles[id] ??= new CreditThrottle(kind, keyIndex, client, (info) =>
    throttleLog.warn(
      { kind, keyIndex, ...info, waitSec: Math.round(info.waitMs / 1000) },
      'credit budget exhausted — pausing new submits until window reset',
    ),
  ));
}

/**
 * Base 69Labs generation service. Video/image differ by `kind` (which selects
 * the /videos or /images endpoints) and by which request fields the provider
 * accepts (`buildBody`). `submit` and `poll` are thin; `download` streams the
 * job's output via the provider's authenticated download endpoint.
 */
abstract class SixtyNineLabsGenerationService implements GenerationService {
  abstract readonly kind: GenerationKind;

  constructor(protected readonly client: SixtyNineLabsClient = new SixtyNineLabsClient()) {}

  /** Number of keys (accounts) in THIS media kind's pool. */
  get keyCount(): number {
    return this.client.keyCountFor(this.kind);
  }

  /** Map our normalized request onto the fields this kind's endpoint accepts. */
  protected abstract buildBody(req: GenerationRequest): CreateGenerationBody;

  async submit(req: GenerationRequest, keyIndex = 0): Promise<GenerationSubmission> {
    // Pace against the live per-window credit budget (of THIS key's account) so
    // the pipeline doesn't burst past 69Labs' quota and 403 every remaining
    // scene. acquire() blocks (up to the window reset) until there's budget.
    const { release } = await throttleFor(this.kind, keyIndex, this.client).acquire();
    try {
      const gen = await this.client.createGeneration(this.kind, this.buildBody(req), keyIndex);
      return { externalId: gen.id, status: gen.status };
    } catch (err) {
      // The submit failed, so no credit was actually consumed by a created job —
      // release the reservation so a transient error (network, 5xx, concurrency
      // 403) doesn't leak budget and needlessly throttle later submits.
      release();
      throw err;
    }
  }

  async poll(externalId: string, keyIndex = 0): Promise<GenerationResult> {
    const gen = await this.client.getGeneration(this.kind, externalId, keyIndex);
    return {
      externalId: gen.id,
      status: gen.status,
      resultUrl: gen.resultUrl,
      costUsd: gen.costUsd,
      error: gen.error,
      raw: gen.raw,
    };
  }

  async download(result: GenerationResult, keyIndex = 0): Promise<Readable> {
    if (!result.externalId) {
      throw new ExternalServiceError('69labs', 'no job id to download', { retryable: false });
    }
    return this.client.download(this.kind, result.externalId, keyIndex);
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
