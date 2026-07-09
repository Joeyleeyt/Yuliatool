import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
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
}

export interface StructuredResult<T> {
  data: T;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

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
      completion = await this.client.beta.chat.completions.parse({
        model: this.model,
        temperature: req.temperature ?? 0.4,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: zodResponseFormat(req.schema, req.schemaName),
      });
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
}
