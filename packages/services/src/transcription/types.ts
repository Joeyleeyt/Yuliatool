export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuatedWord?: string;
}

export interface TranscriptParagraph {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptData {
  language: string | null;
  durationSec: number | null;
  fullText: string;
  words: TranscriptWord[];
  paragraphs: TranscriptParagraph[];
  raw: unknown;
}

/** Speech-to-text provider contract. Implemented by DeepgramService. */
export interface SpeechToTextService {
  transcribeUrl(url: string): Promise<TranscriptData>;
}
