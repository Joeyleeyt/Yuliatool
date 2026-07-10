import { join } from 'node:path';
import { PIP_LAYOUT } from '@yulia/core';
import { runFfmpeg } from './ffmpeg-runner.js';

/**
 * Static rounded-rect alpha mask + pre-blurred drop-shadow PNGs for the PiP
 * overlay window, generated ONCE per render (keyed by window size) instead of
 * per scene/per overlay.
 *
 * The old approach ran `geq` (a per-pixel expression filter) on every overlay
 * frame of every scene to compute a shape that only depends on the window's
 * fixed W/H/corner-radius — identical for every scene in a render, since the
 * canvas size (and therefore the window size) doesn't change mid-render.
 * `geq` has no way to know that; it re-evaluates the same math every frame.
 * Rendering the mask once as a PNG and reusing it via `alphamerge` (window
 * mask) / `overlay` (pre-blurred shadow) does the identical visual math a
 * single time per render instead of width*height*frames*scenes times.
 */
export interface PipMaskPaths {
  /** Grayscale rounded-rect mask (white=inside) at window size, for alphamerge. */
  windowMaskPath: string;
  /** Pre-blurred, pre-opacity black rounded-rect shadow (RGBA) at window size. */
  shadowPath: string;
}

const cache = new Map<string, Promise<PipMaskPaths>>();

/** Get (generating once, cached) the PiP window mask + shadow PNGs for a given window size. */
export function getPipMasks(workDir: string, ow: number, oh: number): Promise<PipMaskPaths> {
  const key = `${workDir}::${ow}x${oh}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = generatePipMasks(workDir, ow, oh);
    cache.set(key, entry);
  }
  return entry;
}

async function generatePipMasks(workDir: string, ow: number, oh: number): Promise<PipMaskPaths> {
  const r = PIP_LAYOUT.cornerRadiusPx;
  const sigma = (PIP_LAYOUT.shadowBlurPx / 3).toFixed(2);
  const windowMaskPath = join(workDir, `pip-mask-${ow}x${oh}.png`);
  const shadowPath = join(workDir, `pip-shadow-${ow}x${oh}.png`);

  // Rounded-rectangle alpha: a pixel is inside if its distance to the inner
  // rect (inset by r) is <= r. Single-quoted so commas survive filtergraph parsing.
  const roundedAlpha =
    `'if(lte(hypot(X-clip(X,${r},W-1-${r}),Y-clip(Y,${r},H-1-${r})),${r}),255,0)'`;

  // Grayscale mask: value IS the alpha we'll merge onto the overlay clip later.
  await runFfmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${ow}x${oh}:d=1`,
    '-frames:v',
    '1',
    '-vf',
    `geq=lum=${roundedAlpha}`,
    windowMaskPath,
  ]);

  // Pre-blurred shadow: same rounded shape, black, blurred + opacity-scaled —
  // baked in once so per-scene compositing is a plain `overlay`, no geq/gblur.
  await runFfmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0:s=${ow}x${oh}:d=1`,
    '-frames:v',
    '1',
    '-vf',
    `format=rgba,geq=r=0:g=0:b=0:a=${roundedAlpha},gblur=sigma=${sigma},` +
      `colorchannelmixer=aa=${PIP_LAYOUT.shadowOpacity}`,
    shadowPath,
  ]);

  return { windowMaskPath, shadowPath };
}
