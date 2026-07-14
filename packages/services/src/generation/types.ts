import type { Readable } from 'node:stream';

export type GenerationKind = 'video' | 'image';

/** Normalized generation status across whatever the provider reports. */
export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string; // '9:16' | '16:9'
  durationSec?: number; // videos only
  seed?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerationSubmission {
  externalId: string;
  status: GenerationStatus;
}

export interface GenerationResult {
  externalId: string;
  status: GenerationStatus;
  resultUrl: string | null;
  costUsd: number | null;
  error: string | null;
  raw: unknown;
}

/**
 * The uniform generation contract. Video and image implementations differ only
 * by the `kind` they submit; the orchestration layer treats them identically.
 */
export interface GenerationService {
  readonly kind: GenerationKind;
  /** Number of API keys (69Labs accounts) in the pool — 1 unless SIXTYNINE_LABS_API_KEYS is set. */
  readonly keyCount: number;
  /** `keyIndex` pins the job to one account for its whole lifecycle (see keyIndexForJob). */
  submit(req: GenerationRequest, keyIndex?: number): Promise<GenerationSubmission>;
  poll(externalId: string, keyIndex?: number): Promise<GenerationResult>;
  download(result: GenerationResult, keyIndex?: number): Promise<Readable>;
}
