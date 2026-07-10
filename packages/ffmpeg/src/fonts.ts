import { existsSync } from 'node:fs';
import { env } from '@yulia/core';

/**
 * Resolve the serif display font used for title cards. The production worker
 * installs a serif family (see infra/docker/worker.Dockerfile) at a known path;
 * `TITLE_CARD_FONT` can override it per-deploy or for local rendering.
 *
 * Robustness: we only ever hand `drawtext` a font file that actually EXISTS.
 * Passing a missing path (e.g. the Linux container path while rendering locally
 * on Windows) makes ffmpeg abort the whole filtergraph. So we probe the override
 * first, then a list of common per-platform serif fonts, and return the first
 * that exists. If NONE is found we return null and the caller drops the title
 * card rather than crashing the render.
 *
 * The returned path is escaped for a single-quoted `drawtext` `fontfile=` value:
 * backslashes become '/', and colons are escaped (Windows drive letters).
 */
export function titleCardFont(): string | null {
  const path = resolveExistingFont();
  if (!path) return null;
  return path.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** First existing font among the override + platform fallbacks, or null. */
function resolveExistingFont(): string | null {
  const candidates = [
    env.TITLE_CARD_FONT, // explicit override (deploy or local)
    DEFAULT_FONT, // worker image's bundled Cinzel (Linux)
    ...PLATFORM_FALLBACKS,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore and try the next candidate
    }
  }
  return null;
}

/**
 * Cinzel is an elegant Trajan-style serif caps face that matches the reference
 * title cards. Installed via the worker image at this path; on other machines
 * it usually won't exist, so the fallbacks below cover local rendering.
 */
const DEFAULT_FONT = '/usr/share/fonts/truetype/cinzel/Cinzel-SemiBold.ttf';

/**
 * Common serif fonts by platform, tried in order when neither the override nor
 * the bundled Cinzel is present. Georgia/Times (Windows/macOS) and DejaVu/
 * Liberation (Linux) are near-universal on their platforms.
 */
const PLATFORM_FALLBACKS = [
  // Windows
  'C:\\Windows\\Fonts\\georgia.ttf',
  'C:\\Windows\\Fonts\\times.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
  // macOS
  '/System/Library/Fonts/Supplemental/Georgia.ttf',
  '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
  '/Library/Fonts/Arial.ttf',
  // Linux
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
