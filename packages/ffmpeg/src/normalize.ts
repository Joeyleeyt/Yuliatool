import {
  RENDER_ENCODING,
  TRANSITION,
  COLOR_GRADE,
  BACKGROUND_CLIP,
  OverlayMotion,
} from '@yulia/core';
import { INTERMEDIATE_ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';
import { probe } from './ffprobe.js';

export interface NormalizeOpts {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

/**
 * Build the `zoompan` z/x/y expressions for one of the editing plan's overlay
 * motions. The image is pre-scaled 1.2x (see `normalizeImageSegment`), so pans
 * and drifts have headroom to move within the oversized frame before it's
 * cropped back to the window size. `static` holds a fixed 1.2x crop (no drift);
 * the zooms push in/out; the pans/drifts hold a constant zoom and travel the
 * crop window across the oversized source.
 *
 * `frames` is the clip length in frames (the travel/zoom is spread across it).
 * Returns the `z=..:x=..:y=..` fragment (without the `zoompan=` head or the
 * trailing `:d=:s=:fps=`), so the caller composes the full filter.
 */
function motionZoompanExpr(motion: OverlayMotion, frames: number): string {
  const f = Math.max(1, frames);
  // Zoom endpoints for the push-in / pull-out motions.
  const zHi = TRANSITION.kenBurnsZoom; // e.g. 1.12
  // Per-frame zoom increment, driven off the frame counter `on` (an exact linear
  // ramp) rather than the self-referential `zoom` accumulator, which round-trips
  // at low precision and adds a little extra crop jitter.
  const zoomInStep = ((zHi - 1) / f).toFixed(6);
  // For pans/drifts we hold a constant, already-zoomed crop so there's slack
  // (iw/zoom < iw) to travel; the crop window then slides edge-to-edge over `f`.
  const hold = zHi.toFixed(4);
  // Fraction of the available slack traversed per frame (0 -> full slack).
  const panStep = (1 / f).toFixed(6);

  switch (motion) {
    case OverlayMotion.STATIC:
      // Fixed centered crop at the hold zoom — no drift.
      return `z='${hold}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
    case OverlayMotion.SLOW_ZOOM_OUT:
      // Start pushed-in, ease back out to 1.0 (centered).
      return (
        `z='max(${hold}-on*${zoomInStep},1.0)':` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
      );
    case OverlayMotion.PAN_LEFT:
      // Hold zoom; slide the crop from right edge to left edge.
      return `z='${hold}':x='(iw-iw/zoom)*(1-on*${panStep})':y='ih/2-(ih/zoom/2)'`;
    case OverlayMotion.PAN_RIGHT:
      return `z='${hold}':x='(iw-iw/zoom)*(on*${panStep})':y='ih/2-(ih/zoom/2)'`;
    case OverlayMotion.DRIFT_UP:
      // Hold zoom; slide the crop from bottom to top.
      return `z='${hold}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on*${panStep})'`;
    case OverlayMotion.DRIFT_DOWN:
      return `z='${hold}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on*${panStep})'`;
    case OverlayMotion.SLOW_ZOOM_IN:
    default:
      // Default (and the historical Ken Burns): gentle centered push-in.
      return `z='min(1.0+on*${zoomInStep},${hold})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  }
}

/**
 * Warm "quiet luxury" grade (eq for tone + curves for champagne/ivory warmth),
 * applied to every scene so video and image scenes read as one graded world.
 */
function gradeFilter(): string {
  return (
    `eq=contrast=${COLOR_GRADE.contrast}:brightness=${COLOR_GRADE.brightness}:` +
    `saturation=${COLOR_GRADE.saturation}:gamma=${COLOR_GRADE.gamma},` +
    `curves=r='${COLOR_GRADE.rCurve}':g='${COLOR_GRADE.gCurve}':b='${COLOR_GRADE.bCurve}'`
  );
}

/**
 * Probe the assembled background's real duration (falls back to the scene length
 * if the probe fails, which makes `buildBackgroundFill` take the no-loop path).
 */
async function backgroundSrcDuration(backgroundPath: string, durationSec: number): Promise<number> {
  const probed = await probe(backgroundPath).catch(() => null);
  return probed && probed.durationSec > 0 ? probed.durationSec : durationSec;
}

/**
 * Longest stretch of SOURCE (seconds) the boomerang path may buffer for one
 * forward→reverse cycle. `reverse` and `loop` both hold decoded frames in RAM
 * (~3MB per 1080p frame), so the cycle — 2x this — is the memory high-water mark:
 * 8s -> 2x8x30 = 480 frames ~= 1.4GB. The real budget is VM RAM split across
 * RENDER_COMPOSITE_CONCURRENCY parallel ffmpegs (16GB/8 ~= 2GB each), not the
 * whole machine, so this leaves headroom. Uncapped, one 122s source built a
 * 7320-frame (~21GB) buffer and Linux SIGKILLed the render.
 *
 * Only a genuinely SHORT source ever reaches the boomerang (a long assembly is
 * covered by Regime 1's stretch — see buildBackgroundFill), so this cap changes
 * nothing for real multi-clip scenes; it only bounds the pathological
 * single-short-clip case. It must stay >= a couple of native clips so a short
 * multi-clip assembly still boomerangs its WHOLE self, not a sliver.
 */
const BOOMERANG_MAX_SRC_SEC = 24;

/**
 * Build the complete `[0:v]…[<outLabel>]` background chain that fills a scene of
 * `durationSec` from an assembled source clip WITHOUT ever freezing a tail.
 *
 * Two regimes, chosen from the source's real (probed) duration:
 *
 *   1. Source is long enough (within `maxSlowFactor` of the scene): cover-crop,
 *      gently slow (`setpts`) so its native motion stretches to fill, fps-fix.
 *      This is the common case and is unchanged from before.
 *
 *   2. Source is SHORT (a big shortfall — the provider returned clips shorter
 *      than assumed, so even max slow can't cover it): instead of clone-padding
 *      a FROZEN tail (the old `tpad`+tiny-zoom, which read as a hard freeze once
 *      the zoom maxed out — client feedback: "still freezing 1:41–2:54"), LOOP
 *      the footage with a seamless boomerang (forward → reverse → forward …) so
 *      the whole scene keeps real motion. The ping-pong joins are seamless (last
 *      frame meets its mirror), so there's no visible cut on repeat.
 *
 * Emits a self-contained filtergraph fragment ending in `[outLabel]`, consuming
 * input pad `[0:v]`. Callers append `,${grade},setsar=1[…]` downstream by
 * relabeling; here we always end at `[outLabel]` and let the caller graft the
 * grade/title/format on via a following filter on that label.
 */
function buildBackgroundFill(
  srcDurationSec: number,
  W: number,
  H: number,
  fps: number,
  durationSec: number,
  outLabel: string,
): string {
  const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const srcDur = srcDurationSec > 0 ? srcDurationSec : durationSec;
  // A small epsilon so a source that's essentially long enough doesn't loop for
  // a few frames' worth of shortfall (the trailing `-t` trims any tiny excess).
  const EPS = 0.15;

  // Regime 1 — STRETCH to fill, playing ALL the footage. Used whenever the
  // source is a real multi-clip assembly (>= LONG_SOURCE_SEC): stretching a
  // dozen distinct clips a little keeps every distinct shot on screen, which is
  // FAR better than looping. `maxSlowFactor` is the *preferred* gentle cap, but a
  // long hold can need more than 1.2x — a 120s assembly over a 154s span needs
  // 1.28x. Stretching a long source even 2-3x still reads as real motion (there's
  // lots of distinct content), whereas looping/boomeranging it is the exact
  // "one video clip repeating" defect the client reported. So for a long source
  // we allow a larger stretch rather than dropping into the boomerang.
  const LONG_SOURCE_SEC = 20; // ~3 native clips: enough distinct footage to stretch
  const gentleCoverSec = srcDur * TRANSITION.maxSlowFactor;
  const isLongAssembly = srcDur >= LONG_SOURCE_SEC;
  if (gentleCoverSec >= durationSec - EPS || isLongAssembly) {
    // Stretch factor: gentle when the source is nearly long enough; otherwise as
    // much as the span needs so no footage is dropped and nothing loops. Bounded
    // so a truly tiny source doesn't fall here (isLongAssembly gates that).
    const factor = Math.max(1, durationSec / srcDur);
    const slow = (gentleCoverSec >= durationSec - EPS
      ? Math.min(TRANSITION.maxSlowFactor, factor)
      : factor
    ).toFixed(4);
    return `[0:v]${cover},setpts=${slow}*PTS,fps=${fps}[${outLabel}]`;
  }

  // Regime 2: boomerang-loop to fill. Build ONE forward+reverse cycle (2×srcDur
  // of seamless motion), then loop that cycle enough whole times to exceed the
  // scene length. `loop` repeats a buffered frame window: we buffer the entire
  // ping-pong cycle and repeat it. Everything past `durationSec` is trimmed by
  // the caller's `-t`. A light constant slow (maxSlowFactor) still applies so the
  // motion reads calm rather than brisk.
  const slow = TRANSITION.maxSlowFactor.toFixed(4);
  // MEMORY BOUND (this filter OOM-killed the render — SIGKILL, no stderr): BOTH
  // `reverse` and `loop` buffer DECODED frames in RAM, and a 1080p frame is ~3MB.
  // Left uncapped, a long source built a cycle of thousands of frames (~22GB) and
  // Linux killed ffmpeg. The render pool runs RENDER_COMPOSITE_CONCURRENCY
  // composites at once, so the real budget is VM RAM / that count — a few GB
  // each, not the whole machine. Cap the buffered source so one cycle stays well
  // inside it; a longer source is simply trimmed, which costs nothing visually
  // (the tail was never going to be seen — the cycle repeats before reaching it).
  const srcForCycle = Math.min(srcDur, BOOMERANG_MAX_SRC_SEC);
  const cycleSec = 2 * srcForCycle; // forward + reverse
  const effectiveCycleSec = cycleSec * TRANSITION.maxSlowFactor;
  // Whole cycles needed to cover the scene (ceil), min 1. Each cycle is one
  // forward + one reverse of the source.
  const cycles = Math.max(1, Math.ceil(durationSec / effectiveCycleSec));
  // Frames in one ping-pong cycle (pre-slow); `loop` counts frames.
  const cycleFrames = Math.max(1, Math.round(cycleSec * fps));
  // Trim the source to the capped cycle length before the split, so `reverse`
  // (which buffers its whole input) never sees more than the cap either.
  const trimForCycle =
    srcForCycle < srcDur ? `trim=duration=${srcForCycle.toFixed(3)},setpts=PTS-STARTPTS,` : '';

  // One cycle already covers the scene — `loop=0` would repeat nothing while
  // still paying the full buffer cost, so skip `loop` entirely and let `-t` trim.
  if (cycles <= 1) {
    return (
      `[0:v]${cover},fps=${fps},setsar=1,${trimForCycle}split[fwd${outLabel}][rv${outLabel}];` +
      `[rv${outLabel}]reverse[rev${outLabel}];` +
      `[fwd${outLabel}][rev${outLabel}]concat=n=2:v=1:a=0[cycle${outLabel}];` +
      `[cycle${outLabel}]setpts=${slow}*PTS,fps=${fps}[${outLabel}]`
    );
  }

  return (
    // Normalize + split, reverse one branch, concat to a forward→reverse cycle.
    `[0:v]${cover},fps=${fps},setsar=1,${trimForCycle}split[fwd${outLabel}][rv${outLabel}];` +
    `[rv${outLabel}]reverse[rev${outLabel}];` +
    `[fwd${outLabel}][rev${outLabel}]concat=n=2:v=1:a=0[cycle${outLabel}];` +
    // Repeat the whole cycle enough times, then gently slow the result. `loop`
    // with size=cycleFrames buffers one cycle and emits it `loop`+1 times total.
    `[cycle${outLabel}]loop=loop=${cycles - 1}:size=${cycleFrames}:start=0,` +
    `setpts=${slow}*PTS,fps=${fps}[${outLabel}]`
  );
}

/**
 * Build ONE scene-length background clip from a scene's sequence of ~8s source
 * clips by cover-cropping each to WxH at NORMAL SPEED and crossfade-chaining
 * them, so the background has real motion for the whole scene instead of a
 * single clip stretched (slow-mo) or frozen to fill it.
 *
 * The chained clips run `Σ clipDur - (n-1)·crossfade`. If that still falls short
 * of `durationSec` (e.g. the provider returned shorter clips than expected), the
 * caller's `buildBackgroundFill` seamlessly boomerang-loops it to length (no
 * frozen tail); if it's longer, the downstream `-t durationSec` trims it.
 * Returns the built clip's path.
 *
 * Single-clip scenes (the common case pre-multi-clip, and any 1-slot scene)
 * short-circuit to that clip directly — the caller's existing slow+fill chain
 * then handles it exactly as before, so nothing regresses for them.
 */
async function buildSceneBackground(
  backgroundPaths: string[],
  output: string,
  o: NormalizeOpts,
): Promise<string> {
  if (backgroundPaths.length <= 1) {
    // Nothing to concat — let the caller consume the single source directly.
    return backgroundPaths[0]!;
  }
  const { width: W, height: H, fps } = o;
  const T = BACKGROUND_CLIP.crossfadeSec;
  const pix = RENDER_ENCODING.pixelFormat;

  // Normalize each source to a plain WxH, native-speed clip first (cover-crop,
  // fix fps/sar/pixfmt). No grade here — the caller grades the assembled result.
  const norm = await Promise.all(
    backgroundPaths.map(async (src, i) => {
      const clip = `${output}.part${i}.mp4`;
      const vf =
        `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `fps=${fps},setsar=1,format=${pix}`;
      await runFfmpeg(['-i', src, '-an', '-vf', vf, ...INTERMEDIATE_ENCODE_ARGS, clip]);
      const probed = await probe(clip).catch(() => null);
      const dur = probed && probed.durationSec > 0 ? probed.durationSec : BACKGROUND_CLIP.nativeClipSec;
      return { clip, dur };
    }),
  );

  // Crossfade-chain the normalized parts. xfade offset is the running sum of
  // the prior parts' durations minus the accumulated crossfade overlaps.
  const inputs = norm.flatMap((n) => ['-i', n.clip]);
  const parts: string[] = [];
  let last = '0:v';
  let offset = 0;
  for (let k = 1; k < norm.length; k++) {
    offset += norm[k - 1]!.dur - T;
    const label = k === norm.length - 1 ? 'bgout' : `bx${k}`;
    parts.push(
      `[${last}][${k}:v]xfade=transition=fade:duration=${T.toFixed(3)}:offset=${offset.toFixed(3)}[${label}]`,
    );
    last = label;
  }
  const chained = `${output}.chain.mp4`;
  await runFfmpeg([
    ...inputs,
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[bgout]',
    '-an',
    ...INTERMEDIATE_ENCODE_ARGS,
    chained,
  ]);
  return chained;
}

/**
 * Full-frame VIDEO scene: assemble the scene's clips (crossfade-chained), fill
 * the scene from them — gently slowing when nearly long enough, or seamlessly
 * boomerang-LOOPING when short (no frozen tail; see buildBackgroundFill) — and
 * grade. Cover-cropped to the whole canvas; no overlay, no shadow.
 */
export async function compositeFullFrameVideo(
  backgroundPaths: string[],
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  const { width: W, height: H, fps } = o;
  const d = o.durationSec.toFixed(3);
  const pix = RENDER_ENCODING.pixelFormat;
  const backgroundPath = await buildSceneBackground(backgroundPaths, output, o);
  const srcDur = await backgroundSrcDuration(backgroundPath, o.durationSec);

  const fill = buildBackgroundFill(srcDur, W, H, fps, o.durationSec, 'bgfill');
  const graph = `${fill};[bgfill]${gradeFilter()},setsar=1,format=${pix}[out]`;

  await runFfmpeg([
    '-i',
    backgroundPath,
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
 * Full-frame IMAGE scene: render the single still full-screen with a slow Ken
 * Burns move (via normalizeImageSegment), then apply the same warm grade as the
 * video scenes so images and videos read as one graded world.
 */
export async function compositeFullFrameImage(
  imagePath: string,
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  const pix = RENDER_ENCODING.pixelFormat;
  // Ken Burns the still to a full-frame clip of the target length...
  const kenBurns = `${output}.kb.mp4`;
  await normalizeImageSegment(imagePath, kenBurns, o);
  // ...then grade it to match the video scenes' look.
  await runFfmpeg([
    '-i',
    kenBurns,
    '-vf',
    `${gradeFilter()},setsar=1,format=${pix}`,
    '-an',
    ...INTERMEDIATE_ENCODE_ARGS,
    output,
  ]);
}

/**
 * Full-frame IMAGE GALLERY scene: rotate through several distinct stills across
 * the scene's on-screen span instead of holding ONE still (or stretching a video
 * clip) for a long wordless stretch — client direction: ~5 fresh images per held
 * minute, no motion clip. Each still becomes a Ken Burns mini-clip (camera move
 * cycled so the gallery doesn't feel uniform), the clips crossfade-chain to
 * EXACTLY `o.durationSec`, and the whole strip is graded to match the video
 * scenes. One still short-circuits to the single Ken Burns hold (no regression).
 */
export async function compositeImageGallery(
  imagePaths: string[],
  output: string,
  o: NormalizeOpts,
): Promise<void> {
  if (imagePaths.length <= 1) {
    await compositeFullFrameImage(imagePaths[0]!, output, o);
    return;
  }

  const pix = RENDER_ENCODING.pixelFormat;
  const n = imagePaths.length;
  // Internal crossfade between consecutive stills — kept well under each still's
  // slot so a short slot can't collapse into an all-fade blur.
  const Tg = Math.min(TRANSITION.durationSec, o.durationSec / (n * 2));
  // Each still holds `slotLen`, overlapping the next by Tg, so the chain totals
  // n·slotLen − (n−1)·Tg = o.durationSec exactly (matches the segment length the
  // concat stage expects, so audio sync is unaffected).
  const slotLen = (o.durationSec + (n - 1) * Tg) / n;
  const partOpts: NormalizeOpts = { ...o, durationSec: slotLen };

  // Cycle the camera move so consecutive stills don't share one motion.
  const motions = [
    OverlayMotion.SLOW_ZOOM_IN,
    OverlayMotion.SLOW_ZOOM_OUT,
    OverlayMotion.PAN_RIGHT,
    OverlayMotion.PAN_LEFT,
    OverlayMotion.DRIFT_UP,
    OverlayMotion.DRIFT_DOWN,
  ];
  const parts = await Promise.all(
    imagePaths.map(async (img, i) => {
      const part = `${output}.g${i}.mp4`;
      await normalizeImageSegment(img, part, partOpts, motions[i % motions.length]!);
      return part;
    }),
  );

  // Crossfade-chain the Ken Burns clips, then grade the assembled strip. xfade
  // offset is the running sum of (slotLen − Tg).
  const inputs = parts.flatMap((p) => ['-i', p]);
  const chain: string[] = [];
  let last = '0:v';
  let offset = 0;
  for (let k = 1; k < n; k++) {
    offset += slotLen - Tg;
    const label = k === n - 1 ? 'gout' : `gx${k}`;
    chain.push(
      `[${last}][${k}:v]xfade=transition=fade:duration=${Tg.toFixed(3)}:offset=${offset.toFixed(3)}[${label}]`,
    );
    last = label;
  }
  const graph = `${chain.join(';')};[gout]${gradeFilter()},setsar=1,format=${pix}[out]`;
  await runFfmpeg([
    ...inputs,
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-t',
    o.durationSec.toFixed(3),
    '-an',
    ...INTERMEDIATE_ENCODE_ARGS,
    output,
  ]);
}

/**
 * Turn a still image into a `durationSec` clip with the editing plan's chosen
 * camera `motion` (defaults to a slow zoom-in — the historical Ken Burns). Pre-
 * scales 1.2x larger than target so zoompan has headroom to zoom/pan/drift
 * without exposing edges.
 */
export async function normalizeImageSegment(
  input: string,
  output: string,
  o: NormalizeOpts,
  motion: OverlayMotion = OverlayMotion.SLOW_ZOOM_IN,
): Promise<void> {
  const frames = Math.max(1, Math.round(o.durationSec * o.fps));
  const overW = Math.round(o.width * 1.2);
  const overH = Math.round(o.height * 1.2);

  // ANTI-SHIMMER: zoompan recomputes an INTEGER crop rectangle each frame, so as
  // the zoom advances by its tiny per-frame step the crop origin snaps to a
  // slightly different whole pixel on an irregular cadence. On detailed
  // photographic stills (skin, fabric weave, hair) that 1-px stepping reads as a
  // SHIMMER/vibration the whole time the image is held (client: "the images are
  // flashed"). Fix: render zoompan at SS× the target resolution, then downscale
  // to size with lanczos — the supersample averages the per-frame snapping into
  // smooth motion and the good-kernel downscale removes the residual shimmer.
  // Measured (detrended inter-frame residual on a high-frequency still): the
  // shimmer roughly HALVES with each step up — SS=1 → ~0.165, SS=1.5 → ~0.102,
  // SS=2 → ~0.051. SS=2 is the point where it stops being visible; we pay ~1.8×
  // the SS=1.5 filter cost for it, acceptable for the image-scene share of a
  // render. (Bumping further to SS=2.5+ buys little and gets expensive.)
  const SS = 2; // supersample factor
  const ssW = Math.round(overW * SS);
  const ssH = Math.round(overH * SS);
  const zpW = Math.round(o.width * SS);
  const zpH = Math.round(o.height * SS);

  const vf = [
    // Upscale the (1.2×-oversized) source to the supersampled working size first,
    // so zoompan samples from a larger buffer — sharper, and less prone to jitter.
    `scale=${ssW}:${ssH}:force_original_aspect_ratio=increase`,
    `crop=${ssW}:${ssH}`,
    `zoompan=${motionZoompanExpr(motion, frames)}:d=${frames}:s=${zpW}x${zpH}:fps=${o.fps}`,
    // Downscale the supersampled zoom to the real target — averages sub-pixel
    // jitter, killing the shimmer. Lanczos for a crisp, stable result.
    `scale=${o.width}:${o.height}:flags=lanczos`,
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
