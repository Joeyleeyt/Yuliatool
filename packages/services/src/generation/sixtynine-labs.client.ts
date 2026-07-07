import { env, ExternalServiceError } from '@yulia/core';
import type { GenerationKind, GenerationStatus } from './types.js';

/**
 * Low-level 69Labs REST client. All HTTP with the provider funnels through here
 * so the request/response contract lives in exactly one place.
 *
 * NOTE: endpoint paths and field names below reflect a conventional generation
 * API shape. If the real 69Labs contract differs, adjust ONLY this file —
 * `mapStatus` + `extractUrl` isolate the mapping, and nothing above the client
 * needs to change.
 */
export interface CreateGenerationBody {
  type: GenerationKind;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: string;
  duration?: number;
  seed?: number;
}

export interface ProviderGeneration {
  id: string;
  status: GenerationStatus;
  resultUrl: string | null;
  costUsd: number | null;
  error: string | null;
  raw: unknown;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class SixtyNineLabsClient {
  constructor(
    private readonly apiKey: string = env.SIXTYNINE_LABS_API_KEY,
    private readonly baseUrl: string = env.SIXTYNINE_LABS_BASE_URL,
  ) {}

  async createGeneration(body: CreateGenerationBody): Promise<ProviderGeneration> {
    const json = await this.request('POST', '/generations', body);
    return this.normalize(json);
  }

  async getGeneration(id: string): Promise<ProviderGeneration> {
    const json = await this.request('GET', `/generations/${encodeURIComponent(id)}`);
    return this.normalize(json);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // 4xx = our fault (bad prompt/params), don't retry; 5xx = transient.
        throw new ExternalServiceError('69labs', `${method} ${path} -> ${res.status} ${text}`, {
          retryable: res.status >= 500 || res.status === 429,
        });
      }
      return (await res.json()) as unknown;
    } catch (cause) {
      if (cause instanceof ExternalServiceError) throw cause;
      throw new ExternalServiceError('69labs', `${method} ${path} request failed`, { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(json: unknown): ProviderGeneration {
    const obj = (json ?? {}) as Record<string, unknown>;
    const id = String(obj.id ?? obj.generation_id ?? '');
    if (!id) throw new ExternalServiceError('69labs', 'response missing generation id');
    return {
      id,
      status: mapStatus(obj.status),
      resultUrl: extractUrl(obj),
      costUsd: typeof obj.cost === 'number' ? obj.cost : null,
      error: typeof obj.error === 'string' ? obj.error : null,
      raw: json,
    };
  }
}

function mapStatus(raw: unknown): GenerationStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'done'].includes(s)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(s)) return 'failed';
  if (['processing', 'in_progress', 'running', 'started'].includes(s)) return 'processing';
  return 'pending';
}

function extractUrl(obj: Record<string, unknown>): string | null {
  const output = obj.output as Record<string, unknown> | undefined;
  const candidates = [obj.result_url, obj.output_url, obj.url, output?.url, output?.video, output?.image];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}
