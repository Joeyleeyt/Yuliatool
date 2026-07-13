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
   * Inspect a clip for hand defects. `videoUrl` may be the provider result URL
   * or a local path (ffmpeg reads both). Returns the vision verdict; `ok: true`
   * means accept, `ok: false` means regenerate.
   */
  async check(videoUrl: string, atSec = 1.5): Promise<HandCheckOutput> {
    let imageUrl: string;
    try {
      imageUrl = await extractFrameDataUrl(videoUrl, { atSec });
    } catch (err) {
      this.ctx.logger.warn({ err, videoUrl }, 'hand-check: frame extraction failed; skipping (fail-open)');
      return failOpen('frame extraction failed');
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
      this.ctx.logger.warn({ err, videoUrl }, 'hand-check: vision call failed; skipping (fail-open)');
      return failOpen('vision call failed');
    }
  }
}

function failOpen(reason: string): HandCheckOutput {
  return { handCount: 0, extraOrDuplicatedHands: false, deformedHands: false, ok: true, reason };
}
