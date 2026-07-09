/**
 * Run an async mapper over `items` with at most `limit` in flight at once.
 * Preserves input order in the results. Rejects on the first error (like
 * Promise.all), after in-flight tasks settle. Used to parallelize per-scene
 * work (downloads, compositing, dispatch) without bursting past provider or
 * VM limits.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const bound = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  const workers = Array.from({ length: Math.min(bound, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
