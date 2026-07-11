import { dirname } from 'node:path';
import {
  RENDER_ENCODING,
  TRANSITION,
  PIP_LAYOUT,
  TITLE_CARD,
  COLOR_GRADE,
  BACKGROUND_CLIP,
  OverlayMotion,
  OverlayPosition,
  OverlayTransition,
} from '@yulia/core';
import { INTERMEDIATE_ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';
import { probe } from './ffprobe.js';
import { titleCardFont } from './fonts.js';
import { getPipMasks } from './pip-masks.js';

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
        `z='if(lte(zoom,1.0),${hold},max(zoom-${zoomInStep},1.0))':` +
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
      return (
        `z='min(zoom+${zoomInStep},${hold})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
      );
  }
}

/** Optional title-card overlay: number + title burned lower-left. */
export interface TitleCardOpts {
  itemNumber: number;
  titleText: string;
}

/** Round to the nearest even integer (libx264 needs even plane dimensions). */
function even(n: number): number {
  return 2 * Math.round(n / 2);
}

/**
 * Warm "quiet luxury" grade (eq for tone + curves for champagne/ivory warmth),
 * applied to the background layer. Shared by the PiP and full-frame paths.
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
  // How much the gentle slow-mo alone can cover.
  const slowCoverSec = srcDur * TRANSITION.maxSlowFactor;
  // A small epsilon so a source that's essentially long enough doesn't loop for
  // a few frames' worth of shortfall (the trailing `-t` trims any tiny excess).
  const EPS = 0.15;

  if (slowCoverSec >= durationSec - EPS) {
    // Regime 1: gentle slow to fill. Cap the factor so a source that's already
    // long enough plays at ~1x; the downstream `-t durationSec` trims any excess.
    const slow = Math.min(TRANSITION.maxSlowFactor, Math.max(1, durationSec / srcDur)).toFixed(4);
    return `[0:v]${cover},setpts=${slow}*PTS,fps=${fps}[${outLabel}]`;
  }

  // Regime 2: boomerang-loop to fill. Build ONE forward+reverse cycle (2×srcDur
  // of seamless motion), then loop that cycle enough whole times to exceed the
  // scene length. `loop` repeats a buffered frame window: we buffer the entire
  // ping-pong cycle and repeat it. Everything past `durationSec` is trimmed by
  // the caller's `-t`. A light constant slow (maxSlowFactor) still applies so the
  // motion reads calm rather than brisk.
  const slow = TRANSITION.maxSlowFactor.toFixed(4);
  const cycleSec = 2 * srcDur; // forward + reverse
  const effectiveCycleSec = cycleSec * TRANSITION.maxSlowFactor;
  // Whole cycles needed to cover the scene (ceil), min 1. Each cycle is one
  // forward + one reverse of the source.
  const cycles = Math.max(1, Math.ceil(durationSec / effectiveCycleSec));
  // Frames in one ping-pong cycle (pre-slow); `loop` counts frames.
  const cycleFrames = Math.max(1, Math.round(cycleSec * fps));

  return (
    // Normalize + split, reverse one branch, concat to a forward→reverse cycle.
    `[0:v]${cover},fps=${fps},setsar=1,split[fwd${outLabel}][rv${outLabel}];` +
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
 * Full-frame composite for a video-only "breather" scene: cover-crop the
 * background to the whole canvas, slow-to-fill, grade, and (optionally) burn the
 * numbered title card. No overlay window, no shadow.
 */
async function compositeFullFrame(
  backgroundPaths: string[],
  output: string,
  o: NormalizeOpts,
  title?: TitleCardOpts,
): Promise<void> {
  const { width: W, height: H, fps } = o;
  const d = o.durationSec.toFixed(3);
  const pix = RENDER_ENCODING.pixelFormat;
  // Assemble the scene's clips (native speed, crossfade-chained) into one
  // background, then fill the scene from it — gently slowing when it's nearly
  // long enough, or seamlessly boomerang-LOOPING when it's short (no frozen
  // tail; see buildBackgroundFill).
  const backgroundPath = await buildSceneBackground(backgroundPaths, output, o);
  const srcDur = await backgroundSrcDuration(backgroundPath, o.durationSec);
  const titleChain = title ? buildTitleCardChain(W, H, title) : '';

  const fill = buildBackgroundFill(srcDur, W, H, fps, o.durationSec, 'bgfill');
  const graph = `${fill};[bgfill]${gradeFilter()},setsar=1${titleChain},format=${pix}[out]`;

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
 * Escape a string for use as an ffmpeg `drawtext` `text=` value inside a
 * filtergraph. Backslash first, then the filtergraph/drawtext metacharacters.
 */
function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/**
 * Build the fade-in → hold → fade-out alpha envelope for a `drawtext` overlay.
 * `drawtext` has no native fade, so the standard idiom is an `alpha` expression.
 */
function drawtextAlphaEnvelope(appear: number, hold: number, fade: number): string {
  const end = appear + hold;
  return (
    `'if(lt(t,${appear.toFixed(3)}),0,` +
    `if(lt(t,${(appear + fade).toFixed(3)}),(t-${appear.toFixed(3)})/${fade.toFixed(3)},` +
    `if(lt(t,${(end - fade).toFixed(3)}),1,` +
    `if(lt(t,${end.toFixed(3)}),(${end.toFixed(3)}-t)/${fade.toFixed(3)},0))))'`
  );
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
  backgroundPaths: string[],
  overlayPaths: string[],
  position: OverlayPosition,
  output: string,
  o: NormalizeOpts,
  title?: TitleCardOpts,
  motions?: OverlayMotion[],
  transition: OverlayTransition = OverlayTransition.CROSSFADE,
): Promise<void> {
  const { width: W, height: H, fps } = o;

  // Full-frame, video-only "breather" scene: no overlay window. Composite the
  // graded background at full canvas (plus the optional title card) and return.
  if (overlayPaths.length === 0) {
    await compositeFullFrame(backgroundPaths, output, o, title);
    return;
  }

  // Assemble the scene's background clips (native speed, crossfade-chained) into
  // one clip; the PiP chain below consumes it exactly as it did a single source.
  const backgroundPath = await buildSceneBackground(backgroundPaths, output, o);

  // Resolve the overlay window's box from the editing plan's position. `center`
  // is a near-full-frame window (it replaces the background); left/right are the
  // narrower gutter windows that keep the focal subject visible on the far side.
  const isCenter = position === OverlayPosition.CENTER;
  const ow = even(
    Math.round(W * (isCenter ? PIP_LAYOUT.centerWidthFrac : PIP_LAYOUT.overlayWidthFrac)),
  );
  const oh = even(
    Math.round(H * (isCenter ? PIP_LAYOUT.centerHeightFrac : PIP_LAYOUT.overlayHeightFrac)),
  );
  const x = isCenter
    ? Math.round((W - ow) / 2)
    : Math.round(W * (position === OverlayPosition.LEFT ? PIP_LAYOUT.leftXFrac : PIP_LAYOUT.rightXFrac));
  // Raise the window above dead-center so the lower-left title card has room.
  const y = Math.round((H - oh) / 2 - H * PIP_LAYOUT.verticalBiasFrac);
  const off = PIP_LAYOUT.shadowOffsetPx;
  const d = o.durationSec.toFixed(3);
  const pix = RENDER_ENCODING.pixelFormat;

  // Window mask + shadow are identical for every scene at this window size (the
  // canvas size doesn't change mid-render) — generated once per render and
  // reused here instead of recomputing the shape with `geq` every frame.
  const { windowMaskPath, shadowPath } = await getPipMasks(dirname(output), ow, oh);

  // The overlay window PUNCTUATES the background: it enters a beat after the
  // scene starts and exits before it ends. Its visible span is then divided
  // EQUALLY among the overlay images, so the window rotates from one image to
  // the next mid-scene (each on screen ~5–8s for a 10–15s scene).
  const ovStart = PIP_LAYOUT.overlayStartOffsetSec;
  const ovEndRaw = o.durationSec - PIP_LAYOUT.overlayEndOffsetSec;
  const ovEnd = Math.max(ovStart + PIP_LAYOUT.minOverlayVisibleSec, ovEndRaw);
  const n = overlayPaths.length;
  const sliceLen = (ovEnd - ovStart) / n;

  // Pre-render each overlay to a motion clip at window size (reuses the proven
  // still-motion path) so each rotated image animates per the editing plan's
  // chosen motion rather than sitting static. `motions[i]` aligns to the overlay
  // by rotation index; a missing entry falls back to the default slow zoom-in.
  const overlayClips = await Promise.all(
    overlayPaths.map(async (p, i) => {
      const clip = `${output}.overlay${i}.mp4`;
      await normalizeImageSegment(
        p,
        clip,
        { width: ow, height: oh, fps, durationSec: o.durationSec },
        motions?.[i] ?? OverlayMotion.SLOW_ZOOM_IN,
      );
      return clip;
    }),
  );

  // Fit the background to the scene: gentle slow when it's nearly long enough,
  // else a seamless boomerang loop (no frozen tail — see buildBackgroundFill).
  const srcDur = await backgroundSrcDuration(backgroundPath, o.durationSec);

  // Warm "quiet luxury" grade on the BACKGROUND only.
  const grade = gradeFilter();
  const titleChain = title ? buildTitleCardChain(W, H, title) : '';

  // Input indices: 0 = background, 1 = shadow PNG (looped, shared by every
  // overlay slice), 2 = window mask PNG (looped), 3..3+n-1 = overlay clips.
  const shadowIdx = 1;
  const maskIdx = 2;
  const overlayInputBase = 3;

  const parts: string[] = [
    // Background fill (slow-or-loop) -> grade -> [bg]. buildBackgroundFill emits
    // `[0:v]…[bgfill]`; graft the grade onto that label to produce [bg].
    `${buildBackgroundFill(srcDur, W, H, fps, o.durationSec, 'bgfill')};` +
      `[bgfill]${grade},setsar=1[bg]`,
  ];

  // Each overlay: merge the pre-baked rounded-rect mask onto its alpha channel
  // (replaces per-frame `geq`), fade in/out at its slice, then composite (with
  // the shared pre-baked shadow) gated to that slice so exactly one image is
  // visible at a time and they hand off with a soft cross-fade. The mask/shadow
  // source pads are re-read (not `split`) per slice — cheap, since each is a
  // single still image, not a video decode.
  let prev = 'bg';
  for (let i = 0; i < n; i++) {
    const sStart = ovStart + i * sliceLen;
    const sEnd = i === n - 1 ? ovEnd : sStart + sliceLen;
    const fadeOutAt = Math.max(sStart, sEnd - PIP_LAYOUT.fadeOutSec).toFixed(3);
    const gate = `enable='between(t,${sStart.toFixed(3)},${sEnd.toFixed(3)})'`;
    const inIdx = overlayInputBase + i;

    // The window's ENTRANCE transition (from the editing plan) applies only to
    // the FIRST overlay slot — that's when the window enters the scene. Later
    // slots are the in-scene rotation hand-off and always soft-crossfade.
    //   crossfade/fade -> alpha fade up (the default)
    //   hard_cut       -> no entrance fade (the enable gate pops it in)
    //   fade_to_white  -> RGB fades up FROM white (a brief white wash), plus the
    //                     alpha fade so the rounded window edge still eases in
    const entrance = i === 0 ? transition : OverlayTransition.CROSSFADE;
    const fin = PIP_LAYOUT.fadeInSec;
    const whiteWash =
      entrance === OverlayTransition.FADE_TO_WHITE
        ? `fade=t=in:st=${sStart.toFixed(3)}:d=${fin}:color=white,`
        : '';
    const alphaFadeIn =
      entrance === OverlayTransition.HARD_CUT
        ? ''
        : `fade=t=in:st=${sStart.toFixed(3)}:d=${fin}:alpha=1,`;

    parts.push(
      `[${shadowIdx}:v]format=rgba[shadowsrc${i}]`,
      `[${maskIdx}:v]format=gray[mask${i}]`,
      // White-wash (if any) is applied to the RGB before alphamerge so it tints
      // the image itself; the alpha fades handle the rounded window edge.
      `[${inIdx}:v]${whiteWash}format=rgba[ovlrgb${i}]`,
      `[ovlrgb${i}][mask${i}]alphamerge,` +
        `${alphaFadeIn}` +
        `fade=t=out:st=${fadeOutAt}:d=${PIP_LAYOUT.fadeOutSec}:alpha=1,setsar=1[ovl${i}]`,
      `[${prev}][shadowsrc${i}]overlay=x=${x + off}:y=${y + off}:${gate}[bgs${i}]`,
      // The last composite also gets the title-card chain + output format/label.
      i === n - 1
        ? `[bgs${i}][ovl${i}]overlay=x=${x}:y=${y}:${gate}${titleChain},format=${pix}[out]`
        : `[bgs${i}][ovl${i}]overlay=x=${x}:y=${y}:${gate}[comp${i}]`,
    );
    prev = `comp${i}`;
  }

  await runFfmpeg([
    '-i',
    backgroundPath,
    '-loop',
    '1',
    '-i',
    shadowPath,
    '-loop',
    '1',
    '-i',
    windowMaskPath,
    ...overlayClips.flatMap((c) => ['-i', c]),
    '-filter_complex',
    parts.join(';'),
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
 * Build the trailing `,drawtext=...,drawtext=...` chain for the numbered title
 * card (number above title, both faded in/out) to append after the PiP overlay.
 * Returns '' when no title is supplied — or when no usable font exists, in which
 * case we skip the card rather than hand ffmpeg a missing fontfile (which aborts
 * the whole render).
 */
function buildTitleCardChain(W: number, H: number, title: TitleCardOpts): string {
  const font = titleCardFont();
  if (!font) return '';
  const x = Math.round(W * TITLE_CARD.xFrac);
  const numberY = Math.round(H * TITLE_CARD.numberYFrac);
  const titleY = Math.round(H * TITLE_CARD.titleYFrac);
  const numberSize = Math.round(H * TITLE_CARD.numberSizeFrac);
  const titleSize = Math.round(H * TITLE_CARD.titleSizeFrac);
  const alpha = drawtextAlphaEnvelope(
    TITLE_CARD.appearOffsetSec,
    TITLE_CARD.holdSec,
    TITLE_CARD.fadeSec,
  );
  const numberText = escapeDrawtext(`#${title.itemNumber}`);
  const titleText = escapeDrawtext(title.titleText.toUpperCase());

  const common =
    `fontcolor=${TITLE_CARD.color}:borderw=${TITLE_CARD.borderWidthPx}:` +
    `bordercolor=${TITLE_CARD.borderColor}:alpha=${alpha}`;

  return (
    `,drawtext=fontfile='${font}':text='${numberText}':x=${x}:y=${numberY}:` +
    `fontsize=${numberSize}:${common}` +
    `,drawtext=fontfile='${font}':text='${titleText}':x=${x}:y=${titleY}:` +
    `fontsize=${titleSize}:${common}`
  );
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

  const vf = [
    `scale=${overW}:${overH}:force_original_aspect_ratio=increase`,
    `crop=${overW}:${overH}`,
    `zoompan=${motionZoompanExpr(motion, frames)}:d=${frames}:s=${o.width}x${o.height}:fps=${o.fps}`,
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
