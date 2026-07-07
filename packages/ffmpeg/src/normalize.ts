import { RENDER_ENCODING, TRANSITION } from '@yulia/core';
import { ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';

export interface NormalizeOpts {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

/**
 * Normalize a generated video clip to the canonical encoding at exactly
 * `durationSec`: cover-scale + center-crop to target dims, fix fps/sar/pixfmt,
 * and clone the final frame (tpad) if the source is shorter than needed.
 */
export async function normalizeVideoSegment(
  input: string,
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  const vf = [
    `scale=${o.width}:${o.height}:force_original_aspect_ratio=increase`,
    `crop=${o.width}:${o.height}`,
    `fps=${o.fps}`,
    `tpad=stop_mode=clone:stop_duration=${o.durationSec.toFixed(3)}`,
    'setsar=1',
    `format=${RENDER_ENCODING.pixelFormat}`,
  ].join(',');

  await runFfmpeg(['-i', input, '-t', o.durationSec.toFixed(3), '-an', '-vf', vf, ...ENCODE_ARGS, output]);
}

/**
 * Turn a still image into a `durationSec` clip with a slow Ken Burns push-in.
 * Pre-scales larger than target so zoompan has headroom to pan without edges.
 */
export async function normalizeImageSegment(
  input: string,
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  const frames = Math.max(1, Math.round(o.durationSec * o.fps));
  const overW = Math.round(o.width * 1.2);
  const overH = Math.round(o.height * 1.2);
  const zoomStep = ((TRANSITION.kenBurnsZoom - 1) / frames).toFixed(6);

  const vf = [
    `scale=${overW}:${overH}:force_original_aspect_ratio=increase`,
    `crop=${overW}:${overH}`,
    `zoompan=z='min(zoom+${zoomStep},${TRANSITION.kenBurnsZoom})':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${o.width}x${o.height}:fps=${o.fps}`,
    'setsar=1',
    `format=${RENDER_ENCODING.pixelFormat}`,
  ].join(',');

  await runFfmpeg([
    '-loop',
    '1',
    '-i',
    input,
    '-t',
    o.durationSec.toFixed(3),
    '-an',
    '-vf',
    vf,
    ...ENCODE_ARGS,
    output,
  ]);
}
