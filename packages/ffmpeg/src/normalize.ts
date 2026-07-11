import { dirname } from 'node:path';
import {
  RENDER_ENCODING,
  TRANSITION,
  PIP_LAYOUT,
  TITLE_CARD,
  COLOR_GRADE,
  type OverlaySide,
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
 * Background fit factor: gently slow a short clip (via PTS) to fill the scene
 * rather than freezing its last frame. Only ever slows down, capped for natural
 * motion; any residual gap still clone-pads (tpad) as a safety net.
 */
async function backgroundSlowFactor(backgroundPath: string, durationSec: number): Promise<string> {
  const probed = await probe(backgroundPath).catch(() => null);
  const srcDur = probed && probed.durationSec > 0 ? probed.durationSec : durationSec;
  return Math.min(TRANSITION.maxSlowFactor, Math.max(1, durationSec / srcDur)).toFixed(4);
}

/**
 * Fill-to-duration chain for a background clip: clone-pad the tail up to the
 * scene length (so length is guaranteed) and then apply a slow, continuous
 * `zoompan` push-in across the WHOLE clip. This turns what used to be a static
 * freeze on the last frame — visible now that clips play near-normal speed and
 * don't stretch to fill (maxSlowFactor ≈ 1) — into a smooth, subtle zoom, so the
 * frozen tail keeps moving instead of hard-freezing (client feedback).
 *
 * Emitted as filter links (no leading/trailing separators) meant to sit between
 * an upstream `...,fps=${fps}` and the downstream grade/format: caller wraps it.
 */
function fillToDurationChain(W: number, H: number, fps: number, durationSec: number): string {
  const frames = Math.max(1, Math.round(durationSec * fps));
  // Pre-scale larger so the zoom has headroom to push in without exposing edges.
  const overW = Math.round(W * 1.2);
  const overH = Math.round(H * 1.2);
  const zoomStep = ((TRANSITION.fillZoom - 1) / frames).toFixed(6);
  const d = durationSec.toFixed(3);
  return (
    `tpad=stop_mode=clone:stop_duration=${d},` +
    `scale=${overW}:${overH}:force_original_aspect_ratio=increase,crop=${overW}:${overH},` +
    `zoompan=z='min(zoom+${zoomStep},${TRANSITION.fillZoom})':d=1:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`
  );
}

/**
 * Full-frame composite for a video-only "breather" scene: cover-crop the
 * background to the whole canvas, slow-to-fill, grade, and (optionally) burn the
 * numbered title card. No overlay window, no shadow.
 */
async function compositeFullFrame(
  backgroundPath: string,
  output: string,
  o: NormalizeOpts,
  title?: TitleCardOpts,
): Promise<void> {
  const { width: W, height: H, fps } = o;
  const d = o.durationSec.toFixed(3);
  const pix = RENDER_ENCODING.pixelFormat;
  const slow = await backgroundSlowFactor(backgroundPath, o.durationSec);
  const titleChain = title ? buildTitleCardChain(W, H, title) : '';

  const graph =
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `setpts=${slow}*PTS,fps=${fps},${fillToDurationChain(W, H, fps, o.durationSec)},` +
    `${gradeFilter()},setsar=1${titleChain},format=${pix}[out]`;

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
  backgroundPath: string,
  overlayPaths: string[],
  side: OverlaySide,
  output: string,
  o: NormalizeOpts,
  title?: TitleCardOpts,
): Promise<void> {
  const { width: W, height: H, fps } = o;

  // Full-frame, video-only "breather" scene: no overlay window. Composite the
  // graded background at full canvas (plus the optional title card) and return.
  if (overlayPaths.length === 0) {
    await compositeFullFrame(backgroundPath, output, o, title);
    return;
  }

  const ow = even(Math.round(W * PIP_LAYOUT.overlayWidthFrac));
  const oh = even(Math.round(H * PIP_LAYOUT.overlayHeightFrac));
  const x = Math.round(W * (side === 'left' ? PIP_LAYOUT.leftXFrac : PIP_LAYOUT.rightXFrac));
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

  // Pre-render each overlay to a Ken Burns clip at window size (reuses the proven
  // still-motion path) so each rotated image drifts gently rather than sitting static.
  const overlayClips = await Promise.all(
    overlayPaths.map(async (p, i) => {
      const clip = `${output}.overlay${i}.mp4`;
      await normalizeImageSegment(p, clip, { width: ow, height: oh, fps, durationSec: o.durationSec });
      return clip;
    }),
  );

  // Fit the background to the scene by gently slowing it (PTS).
  const slow = await backgroundSlowFactor(backgroundPath, o.durationSec);

  // Warm "quiet luxury" grade on the BACKGROUND only.
  const grade = gradeFilter();
  const titleChain = title ? buildTitleCardChain(W, H, title) : '';

  // Input indices: 0 = background, 1 = shadow PNG (looped, shared by every
  // overlay slice), 2 = window mask PNG (looped), 3..3+n-1 = overlay clips.
  const shadowIdx = 1;
  const maskIdx = 2;
  const overlayInputBase = 3;

  const parts: string[] = [
    // Background: cover-crop, gentle slow-mo to fill, fix fps, then fill any tail
    // with a slow zoom-push (instead of a static freeze), grade.
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `setpts=${slow}*PTS,fps=${fps},${fillToDurationChain(W, H, fps, o.durationSec)},${grade},setsar=1[bg]`,
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

    parts.push(
      `[${shadowIdx}:v]format=rgba[shadowsrc${i}]`,
      `[${maskIdx}:v]format=gray[mask${i}]`,
      `[${inIdx}:v]format=rgba[ovlrgb${i}]`,
      `[ovlrgb${i}][mask${i}]alphamerge,` +
        `fade=t=in:st=${sStart.toFixed(3)}:d=${PIP_LAYOUT.fadeInSec}:alpha=1,` +
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
