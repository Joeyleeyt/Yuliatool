import { createClient, type DeepgramClient } from '@deepgram/sdk';
import { env, ExternalServiceError } from '@yulia/core';
import type {
  SpeechToTextService,
  TranscriptData,
  TranscriptParagraph,
  TranscriptWord,
} from './types.js';

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
    const { result, error } = await this.client.listen.prerecorded.transcribeUrl(
      { url },
      {
        model: env.DEEPGRAM_MODEL,
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        detect_language: true,
      },
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
