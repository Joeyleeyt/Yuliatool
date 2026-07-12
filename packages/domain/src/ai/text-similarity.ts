/**
 * Tiny, dependency-free text similarity used to pick a stand-in scene when a
 * scene's own background can't be produced: we reuse the background of the
 * already-generated scene whose narration is closest, so the borrowed visual
 * still matches what's being said at that moment.
 *
 * Token Jaccard over stopword-filtered, lowercased words. This is deliberately
 * simple (no embeddings/model call): the fallback runs inline in the download
 * stage and only needs a "good enough" nearest neighbour among a handful of
 * scenes.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it',
  'its', 'this', 'that', 'these', 'those', 'you', 'your', 'yours', 'i', 'we',
  'they', 'them', 'their', 'he', 'she', 'his', 'her', 'my', 'me', 'so', 'do',
  'does', 'did', 'not', 'no', 'yes', 'can', 'will', 'just', 'how', 'what', 'when',
  'from', 'into', 'out', 'up', 'down', 'over', 'about', 'than', 'then', 'too',
]);

/** Lowercase, split on non-letters, drop stopwords + very short tokens. */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(tokens);
}

/**
 * Jaccard similarity of two texts' significant-word sets, in [0, 1].
 * 0 when either side has no significant tokens.
 */
export function narrationSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Pick, from `candidates`, the item whose `text` is most similar to `target`.
 * Returns null if no candidate has any positive similarity (nothing relevant to
 * borrow). Ties resolve to the earliest candidate for determinism.
 */
export function mostSimilar<T>(
  target: string,
  candidates: readonly T[],
  textOf: (c: T) => string,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const score = narrationSimilarity(target, textOf(c));
    if (score > 0 && (best === null || score > best.score)) {
      best = { item: c, score };
    }
  }
  return best;
}

/**
 * The top-`k` candidates by similarity to `target`, best first, excluding any
 * with zero overlap. Used by the borrow-fallback so a RUN of scenes that all
 * need to borrow (e.g. a whole topic whose narration is near-identical) can
 * spread across several similar donors instead of every scene collapsing onto
 * the single best one — which produced a long stretch of ONE repeated clip
 * ("looping with one scene"). Ties resolve to the earliest candidate.
 */
export function topSimilar<T>(
  target: string,
  candidates: readonly T[],
  textOf: (c: T) => string,
  k: number,
): { item: T; score: number }[] {
  const scored: { item: T; score: number }[] = [];
  for (const c of candidates) {
    const score = narrationSimilarity(target, textOf(c));
    if (score > 0) scored.push({ item: c, score });
  }
  // Stable-ish sort: higher score first; equal scores keep input order.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, k));
}
