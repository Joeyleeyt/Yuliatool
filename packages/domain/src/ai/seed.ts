/**
 * Deterministic seed derived from stable inputs (projectId, scene id, stage).
 * Feeding OpenAI a stable seed makes the pipeline reproducible per unit — the
 * same project re-run yields the same creative output.
 */
export function seedFrom(...parts: string[]): number {
  const s = parts.join(':');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % 2_000_000_000;
}
