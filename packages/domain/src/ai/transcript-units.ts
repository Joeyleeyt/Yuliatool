export interface WordLike {
  word: string;
  punctuatedWord?: string;
  start: number;
  end: number;
}

export interface ParagraphLike {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptUnit {
  index: number;
  text: string;
  start: number;
  end: number;
}

/**
 * Reconstruct sentence-level units (text + real start/end) from Deepgram word
 * timings, so segmentation is grounded in true timestamps rather than anything
 * the LLM invents. Falls back to paragraph units when word timings are absent.
 */
export function buildTranscriptUnits(
  words: WordLike[],
  paragraphs: ParagraphLike[],
): TranscriptUnit[] {
  if (words.length > 0) {
    const units: TranscriptUnit[] = [];
    let buffer: WordLike[] = [];

    const flush = (): void => {
      if (buffer.length === 0) return;
      const first = buffer[0]!;
      const last = buffer[buffer.length - 1]!;
      const text = buffer
        .map((w) => w.punctuatedWord ?? w.word)
        .join(' ')
        .trim();
      units.push({ index: units.length, text, start: first.start, end: last.end });
      buffer = [];
    };

    for (const w of words) {
      buffer.push(w);
      const token = w.punctuatedWord ?? w.word;
      if (/[.!?]["')\]]?$/.test(token)) flush();
    }
    flush();
    if (units.length > 0) return units;
  }

  return paragraphs.map((p, i) => ({ index: i, text: p.text, start: p.start, end: p.end }));
}
