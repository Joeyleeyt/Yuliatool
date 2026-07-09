import { createClient, type DeepgramClient } from '@deepgram/sdk';
import { env, ExternalServiceError } from '@yulia/core';
import type {
  SpeechToTextService,
  TranscriptData,
  TranscriptParagraph,
  TranscriptWord,
} from './types.js';

/**
 * Hard ceiling on a single Deepgram call. Prerecorded transcription of typical
 * voiceovers finishes in seconds; anything approaching this means the request is
 * wedged (e.g. Deepgram can't fetch the signed URL). We'd rather fail and let
 * BullMQ retry than let the job hang forever — the SDK enforces no timeout and
 * BullMQ auto-renews the lock while the handler is pending, so without this a
 * stuck request never stalls out.
 */
const TRANSCRIBE_TIMEOUT_MS = 120_000;

/**
 * Deepgram transcription (prerecorded, by URL). We hand Deepgram a short-lived
 * signed R2 URL rather than streaming bytes through our process.
 *
 * `smart_format` + `punctuate` + `paragraphs` give us clean sentence/paragraph
 * boundaries — the raw material the segmenter (Phase 4) splits into scenes.
 */
export class DeepgramService implements SpeechToTextService {
  private readonly client: DeepgramClient;

  constructor(client?: DeepgramClient) {
    this.client = client ?? createClient(env.DEEPGRAM_API_KEY);
  }

  async transcribeUrl(url: string): Promise<TranscriptData> {
    const { result, error } = await withTimeout(
      this.client.listen.prerecorded.transcribeUrl(
        { url },
        {
          model: env.DEEPGRAM_MODEL,
          smart_format: true,
          punctuate: true,
          paragraphs: true,
          detect_language: true,
        },
      ),
      TRANSCRIBE_TIMEOUT_MS,
    );

    if (error) {
      throw new ExternalServiceError('deepgram', error.message ?? 'transcription failed');
    }
    if (!result) {
      throw new ExternalServiceError('deepgram', 'empty transcription result');
    }

    const channel = result.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];

    const words: TranscriptWord[] = (alt?.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      ...(w.punctuated_word ? { punctuatedWord: w.punctuated_word } : {}),
    }));

    const paragraphs: TranscriptParagraph[] = (alt?.paragraphs?.paragraphs ?? []).map((p) => ({
      text: (p.sentences ?? []).map((s) => s.text).join(' '),
      start: p.start,
      end: p.end,
    }));

    const detected = channel as { detected_language?: string } | undefined;

    return {
      language: detected?.detected_language ?? null,
      durationSec: result.metadata?.duration ?? null,
      fullText: alt?.transcript ?? '',
      words,
      paragraphs,
      raw: result,
    };
  }
}

/**
 * Reject with an ExternalServiceError if `promise` doesn't settle within `ms`.
 * The underlying request is left to settle on its own (the SDK exposes no abort
 * handle); we simply stop waiting so the job can fail and be retried.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ExternalServiceError('deepgram', `transcription timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
