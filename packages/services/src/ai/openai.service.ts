import OpenAI, { RateLimitError } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ParsedChatCompletion } from 'openai/resources/beta/chat/completions';
import type { z } from 'zod';
import { env, ExternalServiceError } from '@yulia/core';

export interface StructuredRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  user: string;
  temperature?: number;
  seed?: number;
  maxTokens?: number;
  /**
   * Optional image for a vision call (data: URL or public https URL). When set,
   * the user message becomes multimodal (text + image) so a vision-capable model
   * (e.g. gpt-4o) can inspect the frame — used by the hand-anatomy check that
   * screens generated clips for extra/deformed hands.
   */
  imageUrl?: string;
}

export interface StructuredResult<T> {
  data: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

/**
 * How many times a single `complete()` call retries a 429 (rate limit) before
 * giving up and letting BullMQ's own job-level retry take over. OpenAI's 429
 * body includes a "try again in Xs" hint (usually 1-5s on a TPM cap) which is
 * normally trivially recoverable WITHIN one job attempt — without this, a
 * single scene hitting the org's per-minute cap fails the entire batched
 * prompt-generation job (mapLimit rejects on first error), even though the
 * other 7 in-flight scenes would have succeeded.
 */
const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 2_000;

/**
 * Thin, domain-agnostic wrapper over OpenAI structured outputs. Every call is
 * schema-constrained (strict json_schema) and validated, so callers get typed,
 * guaranteed-shaped data. Determinism: low temperature + explicit seed.
 */
export class OpenAIService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(client?: OpenAI, model?: string) {
    this.client = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = model ?? env.OPENAI_MODEL;
  }

  async complete<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let completion;
    try {
      completion = await this.requestWithRateLimitRetry(req);
    } catch (cause) {
      throw new ExternalServiceError('openai', 'completion request failed', { cause });
    }

    const choice = completion.choices[0];
    if (!choice) throw new ExternalServiceError('openai', 'no choices returned');
    if (choice.message.refusal) {
      throw new ExternalServiceError('openai', `model refused: ${choice.message.refusal}`, {
        retryable: false,
      });
    }
    if (choice.finish_reason === 'length') {
      // The model hit its max output tokens mid-response. The SDK still parses
      // whatever JSON completed before the cutoff (e.g. a truncated array), which
      // looks like a valid-but-wrong result if we don't check this explicitly —
      // silently accepting it drops data (e.g. a segmentation response cut off
      // after only the first few scenes of a long transcript). Retryable so the
      // caller can chunk the request smaller and retry.
      throw new ExternalServiceError('openai', 'response truncated: exceeded max output tokens', {
        retryable: true,
      });
    }
    const data = choice.message.parsed;
    if (data === null || data === undefined) {
      throw new ExternalServiceError('openai', 'structured parse returned empty');
    }

    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : null;

    return { data, usage };
  }

  /**
   * Issue the completion request, retrying IN-PROCESS on 429 (rate limit) up to
   * RATE_LIMIT_MAX_RETRIES times. A TPM-cap 429 is normally clear within a few
   * seconds (OpenAI's error message states how long), so retrying here lets one
   * scene's transient rate limit resolve without failing the whole batched
   * prompt-generation job over a single hiccup among many concurrent scenes.
   */
  private async requestWithRateLimitRetry<T>(
    req: StructuredRequest<T>,
  ): Promise<ParsedChatCompletion<T>> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.beta.chat.completions.parse({
          model: this.model,
          temperature: req.temperature ?? 0.4,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          messages: [
            { role: 'system', content: req.system },
            {
              role: 'user',
              // Multimodal when an image is supplied (vision check), plain text otherwise.
              content: req.imageUrl
                ? [
                    { type: 'text', text: req.user },
                    { type: 'image_url', image_url: { url: req.imageUrl } },
                  ]
                : req.user,
            },
          ],
          response_format: zodResponseFormat(req.schema, req.schemaName),
        });
      } catch (cause) {
        if (!(cause instanceof RateLimitError) || attempt >= RATE_LIMIT_MAX_RETRIES) throw cause;
        const delayMs = rateLimitDelayMs(cause, attempt);
        await sleep(delayMs);
      }
    }
  }
}

/**
 * Delay before the next rate-limit retry. Prefers OpenAI's own "Please try
 * again in Xs" hint from the error message (precise, usually just a couple
 * seconds for a TPM cap); falls back to exponential backoff if the message
 * shape ever changes.
 */
function rateLimitDelayMs(error: RateLimitError, attempt: number): number {
  const hint = /try again in ([\d.]+)s/i.exec(error.message ?? '');
  if (hint) return Math.ceil(Number(hint[1]) * 1000) + 250; // small buffer past the hint
  return RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
