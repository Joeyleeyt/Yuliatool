import { RENDER_ENCODING, TRANSITION, PIP_LAYOUT, type OverlaySide } from '@yulia/core';
import { INTERMEDIATE_ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';
import { probe } from './ffprobe.js';

export interface NormalizeOpts {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

/** Round to the nearest even integer (libx264 needs even plane dimensions). */
function even(n: number): number {
  return 2 * Math.round(n / 2);
}

/**
 * Composite one scene of the picture-in-picture format: a wide background video
 * with a portrait overlay "window" floated over it — scaled to the layout box,
 * rounded corners, a soft drop shadow, and a fade-in — at the scene's side.
 *
 * Output is a canonical WxH clip of exactly `durationSec` (background is
 * cover-cropped and clone-padded/trimmed to length), ready to feed the crossfade
 * chain just like a plain normalized segment.
 */
export async function compositeScene(
  backgroundPath: string,
  overlayPath: string,
  side: OverlaySide,
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  const { width: W, height: H, fps } = o;
  const ow = even(Math.round(W * PIP_LAYOUT.overlayWidthFrac));
  const oh = even(Math.round(H * PIP_LAYOUT.overlayHeightFrac));
  const x = Math.round(W * (side === 'left' ? PIP_LAYOUT.leftXFrac : PIP_LAYOUT.rightXFrac));
  const y = Math.round((H - oh) / 2);
  const r = PIP_LAYOUT.cornerRadiusPx;
  const off = PIP_LAYOUT.shadowOffsetPx;
  const sigma = (PIP_LAYOUT.shadowBlurPx / 3).toFixed(2);
  const d = o.durationSec.toFixed(3);
  const pix = RENDER_ENCODING.pixelFormat;

  // 1. Give the overlay still life with a slow Ken Burns push-in, pre-rendered to
  //    the window size (reuses the proven still-motion path). This removes the
  //    "static insert" feel — the window drifts gently for the whole scene.
  const overlayClip = `${output}.overlay.mp4`;
  await normalizeImageSegment(overlayPath, overlayClip, {
    width: ow,
    height: oh,
    fps,
    durationSec: o.durationSec,
  });

  // 2. Fit the background to the scene by gently slowing it (PTS) rather than
  //    freezing the last frame. Only ever slow down (never speed up), capped so
  //    it stays natural; any residual gap still clone-pads as a safety net.
  const probed = await probe(backgroundPath).catch(() => null);
  const srcDur = probed && probed.durationSec > 0 ? probed.durationSec : o.durationSec;
  const slow = Math.min(TRANSITION.maxSlowFactor, Math.max(1, o.durationSec / srcDur)).toFixed(4);

  // Rounded-rectangle alpha: a pixel is inside if its distance to the inner
  // rect (inset by r) is <= r. Single-quoted so commas survive filtergraph parsing.
  const roundedAlpha =
    `'if(lte(hypot(X-clip(X,${r},W-1-${r}),Y-clip(Y,${r},H-1-${r})),${r}),255,0)'`;

  const graph = [
    // Background: cover-crop, gentle slow-mo to fill, fix fps, safety clone-pad.
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `setpts=${slow}*PTS,fps=${fps},tpad=stop_mode=clone:stop_duration=${d},setsar=1[bg]`,
    // Overlay (already moving): round the corners via alpha, then fade in.
    `[1:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a=${roundedAlpha},` +
      `fade=t=in:st=0:d=${PIP_LAYOUT.fadeInSec}:alpha=1,setsar=1[ovlbase]`,
    `[ovlbase]split[ovl][forshadow]`,
    // Shadow: black silhouette of the rounded window, blurred + 20% opacity.
    `[forshadow]geq=r=0:g=0:b=0:a='alpha(X,Y)',gblur=sigma=${sigma},` +
      `colorchannelmixer=aa=${PIP_LAYOUT.shadowOpacity}[shadow]`,
    // Composite shadow (offset) then the window over the background.
    `[bg][shadow]overlay=x=${x + off}:y=${y + off}[bgs]`,
    `[bgs][ovl]overlay=x=${x}:y=${y},format=${pix}[out]`,
  ].join(';');

  await runFfmpeg([
    '-i',
    backgroundPath,
    '-i',
    overlayClip,
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-t',
    d,
    '-an',
    ...INTERMEDIATE_ENCODE_ARGS,
    output,
  ]);
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

  await runFfmpeg(['-i', input, '-t', o.durationSec.toFixed(3), '-an', '-vf', vf, ...INTERMEDIATE_ENCODE_ARGS, output]);
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
    ...INTERMEDIATE_ENCODE_ARGS,
    output,
  ]);
}
