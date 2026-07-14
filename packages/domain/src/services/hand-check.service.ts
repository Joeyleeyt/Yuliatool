import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { HandCheckSchema, type HandCheckOutput } from '@yulia/core';
import { OpenAIService } from '@yulia/services';
import { extractFrameDataUrl } from '@yulia/ffmpeg';
import type { AppContext } from '../context.js';
import { handCheckSystem, handCheckUser } from '../ai/index.js';

/**
 * Post-generation hand-anatomy screen. Grabs a mid-clip frame from a generated
 * background clip and asks a vision model whether the hands are anatomically
 * plausible (no extra/duplicated/deformed hands — the "three hands" defect).
 *
 * Deliberately best-effort at the edges: if the frame can't be extracted or the
 * vision call errors, `check` returns `ok: true` (fail-OPEN) so a flaky check
 * never blocks a project — the check only ever *rejects* on a confident visual
 * verdict, never on its own infrastructure failing.
 */
export class HandCheckService {
  private readonly ai: OpenAIService;

  constructor(
    private readonly ctx: AppContext,
    ai?: OpenAIService,
  ) {
    // gpt-4o (the default OPENAI_MODEL) is vision-capable; reuse it.
    this.ai = ai ?? new OpenAIService();
  }

  /**
   * Inspect a clip for hand defects. `clip` is the generated clip's bytes
   * (streamed via the provider's authenticated download — the 69Labs download
   * endpoint 401s without a Bearer key, so ffmpeg can never read the provider
   * URL directly). Buffered to a local temp file first since ffmpeg needs a
   * seekable input to `-ss` seek into. Returns the vision verdict; `ok: true`
   * means accept, `ok: false` means regenerate.
   */
  async check(clip: Readable, atSec = 1.5): Promise<HandCheckOutput> {
    const dir = await mkdtemp(join(tmpdir(), 'yulia-handcheck-'));
    const clipPath = join(dir, 'clip.mp4');
    let imageUrl: string;
    try {
      await pipeline(clip, createWriteStream(clipPath));
      imageUrl = await extractFrameDataUrl(clipPath, { atSec });
    } catch (err) {
      this.ctx.logger.warn({ err }, 'hand-check: frame extraction failed; skipping (fail-open)');
      return failOpen('frame extraction failed');
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }

    try {
      const { data } = await this.ai.complete({
        schema: HandCheckSchema,
        schemaName: 'HandCheck',
        system: handCheckSystem(),
        user: handCheckUser(),
        imageUrl,
        temperature: 0, // deterministic verdict
      });
      return data;
    } catch (err) {
      this.ctx.logger.warn({ err }, 'hand-check: vision call failed; skipping (fail-open)');
      return failOpen('vision call failed');
    }
  }
}

export function failOpen(reason: string): HandCheckOutput {
  return { handCount: 0, extraOrDuplicatedHands: false, deformedHands: false, ok: true, reason };
}
