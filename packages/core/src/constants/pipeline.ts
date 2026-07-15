import { SceneVisualType, OverlayPosition } from '../enums/asset.js';

/**
 * Core pipeline constants. Central so the segmenter, prompt generator, worker
 * orchestration, and FFmpeg pipeline all agree on the same numbers.
 */

/**
 * Segmentation cadence: every scene is 16–25s. A 20-minute (1200s) video is thus
 * cut into ~50–65 scenes (roughly half the count at the old 10-15s cadence) —
 * fewer 69Labs generation calls (cost, wall-clock, rate-limit pressure) while
 * scenes stay grounded in real transcript timestamps either way, so audio/video
 * sync is unaffected by this number. This is HARD-ENFORCED in buildScenes (any
 * LLM scene longer than the max is split into even sub-scenes), because the
 * model alone ignored the window and returned a handful of giant topic groups.
 *
 * `SEGMENT_WINDOW_SEC` is the target the prompt asks for AND the split bound the
 * code enforces: `.split` is the longest a scene may be before it's divided;
 * splits aim for `.target` seconds each. `.split` (25s) is sized against
 * TRANSITION.maxSlowFactor: 69Labs' default model returns ~8s clips with no
 * duration control, so an 8s clip must be slowed up to 25/8 = 3.125x to fill the
 * longest scene without freeze-padding — see maxSlowFactor's doc.
 */
export const SEGMENT_WINDOW_SEC = { min: 16, max: 25, target: 20, split: 25 } as const;

/**
 * Segmentation is chunked across multiple OpenAI calls for long transcripts so
 * a single response never has to emit the whole scene list at once. At ~20s per
 * scene (SEGMENT_WINDOW_SEC.target), ~180s of narration is ~9 scenes x 7 fields
 * each — comfortably inside gpt-4o's 16,384-token output ceiling even with very
 * verbose fields, while a full 10+ minute video (~30+ scenes) would not be.
 * `overlapUnits` repeats the last few units of narration as read-only context in
 * the next chunk's prompt (not re-segmented) purely so the model can keep tone/
 * continuity across the boundary; the actual split point is exact and gapless.
 */
export const SEGMENTATION_CHUNK = { targetWindowSec: 180, overlapUnits: 3 } as const;

/**
 * Overlay rotation within a scene. The overlay window swaps to a fresh image
 * every ~8–10s (on screen ~5s of true visibility once fade in/out and the
 * scene's entry/exit offsets are subtracted — see PIP_LAYOUT), so a 16–25s
 * scene shows 2–3 overlays (≤~21s → 2, longer → 3).
 *   - min/max: each overlay SLOT (rotation period) is this long.
 *   - target:  preferred slot length used to compute how many overlays a scene
 *              needs (round(sceneDuration / target), clamped to [1, maxPerScene]).
 */
export const OVERLAY_SLOT_SEC = { min: 8, max: 10, target: 8.5, maxPerScene: 3 } as const;

/**
 * Number of overlay images a scene of `sceneDurationSec` should rotate through,
 * so each is on screen ~OVERLAY_SLOT_SEC.target. Clamped to [1, maxPerScene].
 * Shared by generation (how many to make) and render (how many to rotate).
 */
export function overlayCountForDuration(sceneDurationSec: number): number {
  const n = Math.round(sceneDurationSec / OVERLAY_SLOT_SEC.target);
  return Math.max(1, Math.min(OVERLAY_SLOT_SEC.maxPerScene, n));
}

/**
 * Background video clips per scene. 69Labs returns ~8s clips with no duration
 * control, but a scene is 16–25s — so instead of stretching/freezing ONE clip
 * to fill the scene (which read as slow-motion, then as a frozen tail), a scene
 * generates SEVERAL clips that the renderer plays back-to-back at normal speed.
 *
 * Count = ceil(sceneDuration / nativeClipSec), so the clips (minus the small
 * crossfade overlaps between them) cover the whole scene with real motion. A
 * short final remainder still zoom-fills as a safety net (see the render side).
 * Clamped to [1, maxPerScene] to bound generation cost/rate-limit pressure.
 */
export const BACKGROUND_CLIP = {
  nativeClipSec: 8, // 69Labs default clip length (no duration control)
  maxPerScene: 4, // normal ceiling for a within-cadence scene (4×8s covers 25s)
  crossfadeSec: 0.4, // short dissolve where consecutive sub-clips meet
  // A scene's ON-SCREEN span can exceed its narration length when a long WORDLESS
  // gap follows it (e.g. a music-only stretch): the scene is held until the next
  // scene starts. Filling that whole span by LOOPING one short assembly read as
  // "a video looped for 2 min" (client feedback). Instead we generate enough
  // DISTINCT clips to cover the display span with fresh footage — bounded by this
  // higher ceiling so a pathological gap can't request unlimited generations.
  maxPerLongScene: 16, // 16×8s ≈ 2 min of distinct footage before we must loop
} as const;

/**
 * Background clips for a scene displayed for `displaySec`. Normally this is the
 * scene's narration length (→ ≤ maxPerScene). For a scene held across a long
 * wordless gap, `displaySec` is the full on-screen span, so more distinct clips
 * are generated to cover it (→ up to maxPerLongScene) instead of looping one.
 */
export function backgroundClipCountForDuration(displaySec: number): number {
  const n = Math.ceil(displaySec / BACKGROUND_CLIP.nativeClipSec);
  return Math.max(1, Math.min(BACKGROUND_CLIP.maxPerLongScene, n));
}

// How often the generation stage polls 69Labs for a result now lives in `env`
// (GENERATION_POLL_INTERVAL_SEC) so it's tunable per-deploy without a rebuild.

/**
 * Videos and images are SEPARATE full-frame scenes (client direction):
 *   - VIDEO  = a full-frame video scene (69Labs video clip[s], full canvas).
 *   - IMAGE  = a full-frame IMAGE scene (one/several 69Labs stills, Ken Burns).
 *
 * Placement balances TWO client directions:
 *  1. VIDEO IS THE SCARCE RESOURCE (69Labs plans give far more image than video
 *     credits), so we front-load video and taper it: more video in the opening,
 *     less after the `VISUAL_TAPER_SEC` mark. Each window has a TARGET video
 *     share (`VISUAL_MIX`) — the RATIO is the budget.
 *  2. IMAGES MUST FOLLOW THE VOICEOVER (earlier feedback: "images don't follow
 *     the narration"): within that budget we prefer to spend image slots on
 *     beats whose narration NAMES something showable (`narrationHasProductBeat`).
 *     If a window needs more images than there are product beats, we fall back to
 *     positional fill so the target ratio is still met.
 *
 * Spacing keeps the edit MIXED — images are separated by at least
 * `MIN_IMAGE_GAP_SCENES` video scenes, so there's never a run of images and
 * motion carries the narrative between them. First/last are always video
 * (stronger open/close).
 */
/**
 * When the taper kicks in. Before this the OPENING sandwich runs; at/after it the
 * BODY sandwich runs. Client spec: "first 5 minutes use more video, after 5
 * minutes use less video."
 */
export const VISUAL_TAPER_SEC = 300;

/**
 * The repeating VIDEO/IMAGE sandwich per window, given verbatim by the client:
 *   - opening (< 5 min): V-V-I-I  → video:image = 5:5 (50% video)
 *   - body   (≥ 5 min):  V-I-I    → video:image = 1:2 (33% video)
 * The pattern cycles across the window's scenes; index within the window mod the
 * pattern length picks the base type. Content-awareness then refines WHICH scenes
 * are images without changing the per-window COUNT (see assignVisualTypes).
 */
const V = SceneVisualType.VIDEO;
const I = SceneVisualType.IMAGE;
export const VISUAL_SANDWICH = {
  opening: [V, V, I, I],
  body: [V, I, I],
} as const;

/** Target VIDEO fraction per window, matching the sandwich ratios above. */
const VIDEO_FRACTION = { opening: 0.5, body: 1 / 3 } as const;

/**
 * Assign VIDEO/IMAGE per scene following the client's sandwich pattern, then
 * refine placement so image slots prefer content-relevant beats.
 *
 * Two stages:
 *  1. POSITIONAL sandwich — walk scenes in order, cycling the window's pattern
 *     (opening vs body, chosen per scene by `sceneStarts` vs VISUAL_TAPER_SEC).
 *     This fixes the per-window video/image RATIO exactly as the client specified.
 *  2. CONTENT REFINEMENT — within each contiguous window, if the pattern marked a
 *     scene as IMAGE whose narration names nothing showable while a nearby VIDEO
 *     scene DOES (`narrationHasProductBeat`), swap the two. This keeps the COUNT
 *     (and thus the video-credit budget) identical but moves stills onto beats
 *     that have something to depict — honoring "images must follow the voiceover".
 *
 * First and last scenes are always VIDEO (stronger open/close). `sceneStarts` is
 * optional; without it every scene uses the opening pattern.
 */
export function assignVisualTypes(
  narrations: readonly string[],
  sceneStarts?: readonly number[],
): SceneVisualType[] {
  const n = narrations.length;
  const types: SceneVisualType[] = new Array(n).fill(SceneVisualType.VIDEO);
  if (n <= 2) return types; // 0-2 scenes: all video (open/close only)

  const isBody = (i: number): boolean => (sceneStarts?.[i] ?? 0) >= VISUAL_TAPER_SEC;

  // Stage 1: per-window ratio-exact placement.
  // For each window (opening / body) take its scene indices, hold the FIRST and
  // LAST scene of the WHOLE video as VIDEO (smooth bookends), then choose exactly
  // `round(count * imageFraction)` of the window's MIDDLE scenes to be IMAGE,
  // laid out on the sandwich pattern's image positions. Forcing the bookends does
  // NOT inflate video: the image count is computed against the window size and
  // filled from the interior, so the ratio stays on target (5:5 / 1:2).
  const windows: Array<{ isBody: boolean; idxs: number[] }> = [];
  for (let i = 0; i < n; i++) {
    const body = isBody(i);
    const last = windows[windows.length - 1];
    if (last && last.isBody === body) last.idxs.push(i);
    else windows.push({ isBody: body, idxs: [i] });
  }
  for (const w of windows) {
    const videoFraction = w.isBody ? VIDEO_FRACTION.body : VIDEO_FRACTION.opening;
    const imageTarget = Math.round(w.idxs.length * (1 - videoFraction));
    // Candidate scenes that may become images: exclude the global first/last
    // scene (kept VIDEO for smooth open/close).
    const candidates = w.idxs.filter((i) => i !== 0 && i !== n - 1);
    // Lay the sandwich pattern over the candidates IN ORDER so the rhythm reads
    // V-V-I-I / V-I-I. Convert the pattern's IMAGE positions first (preserving
    // cadence); if the exact ratio needs a few more images than the pattern's
    // image slots (can happen when the bookends fall on the window edges), take
    // the remaining VIDEO positions from the END backward so added images don't
    // disturb the leading rhythm.
    const pattern = w.isBody ? VISUAL_SANDWICH.body : VISUAL_SANDWICH.opening;
    const patImageSlots: number[] = [];
    const patVideoSlots: number[] = [];
    candidates.forEach((i, k) => {
      if (pattern[k % pattern.length] === I) patImageSlots.push(i);
      else patVideoSlots.push(i);
    });
    let toPlace = imageTarget;
    for (const i of patImageSlots) {
      if (toPlace <= 0) break;
      types[i] = SceneVisualType.IMAGE;
      toPlace--;
    }
    for (const i of patVideoSlots.reverse()) {
      if (toPlace <= 0) break;
      types[i] = SceneVisualType.IMAGE;
      toPlace--;
    }
  }

  // Stage 2: content refinement within each window (count-preserving swaps).
  // For an IMAGE scene with no product beat, hand its "image slot" to the nearest
  // VIDEO scene in the same window that HAS one — the still then matches narration.
  // Endpoints (0, n-1) are excluded as swap targets to keep open/close on video.
  for (let i = 1; i < n - 1; i++) {
    if (types[i] !== SceneVisualType.IMAGE) continue;
    if (narrationHasProductBeat(narrations[i]!)) continue; // already relevant
    for (let d = 1; d < n; d++) {
      let swapped = false;
      for (const j of [i - d, i + d]) {
        if (j <= 0 || j >= n - 1) continue;
        if (isBody(j) !== isBody(i)) continue; // stay within the same window
        if (types[j] === SceneVisualType.VIDEO && narrationHasProductBeat(narrations[j]!)) {
          types[i] = SceneVisualType.VIDEO;
          types[j] = SceneVisualType.IMAGE;
          swapped = true;
          break;
        }
      }
      if (swapped) break;
    }
  }
  return types;
}

/**
 * Gallery cadence: roughly one fresh still every this many seconds of on-screen
 * time. A held IMAGE scene rotates through several distinct stills instead of
 * holding one frame. A 60s image hold → ~5 stills.
 */
export const IMAGE_SLOT_SEC = 12;

/**
 * Upper bound on stills per scene. Capped low (client feedback: "not 10 images in
 * a row") so a held image scene shows a SHORT rotation, not a wall of stills —
 * keeps the edit mixed and the images close to the beat's narration.
 */
export const IMAGE_MAX_PER_SCENE = 5;

/**
 * How many distinct full-frame stills a scene displayed for `displaySec` should
 * rotate through, so each is on screen ~IMAGE_SLOT_SEC. Clamped to
 * [1, IMAGE_MAX_PER_SCENE]. Shared by generation (how many to make) and render
 * (how many to rotate) — but render adapts to however many actually stored.
 */
export function imageCountForDuration(displaySec: number): number {
  const n = Math.round(displaySec / IMAGE_SLOT_SEC);
  return Math.max(1, Math.min(IMAGE_MAX_PER_SCENE, n));
}

/**
 * Whether a scene renders as a rotating gallery of full-frame stills (vs a
 * video-clip scene): TRUE only for an IMAGE scene. Held VIDEO beats keep their
 * motion (multi-clip fill) rather than being converted to stills — client
 * feedback was that too many scenes had become images and the edit needs video
 * and images MIXED. IMAGE scenes still rotate a short gallery when held.
 * The single visual decision is made at generation time (which creates the image
 * assets); download + render then follow whichever assets exist.
 */
export function sceneRendersAsGallery(
  visualType: SceneVisualType,
  _displaySpanSec: number,
): boolean {
  return visualType === SceneVisualType.IMAGE;
}

/**
 * Whether a scene is a full-frame IMAGE scene (vs a full-frame VIDEO scene).
 * Retains the old name so existing call sites read naturally; there is no longer
 * an overlay "window" — an IMAGE scene IS the image, full-screen.
 */
export function sceneHasOverlay(visualType: SceneVisualType): boolean {
  return visualType === SceneVisualType.IMAGE;
}

/** True when the scene's single visual is a full-frame image (no video clip). */
export function sceneIsFullFrameImage(visualType: SceneVisualType): boolean {
  return visualType === SceneVisualType.IMAGE;
}

/**
 * Cheap, deterministic heuristic for whether a narration beat names a concrete
 * thing to *show* in an inset window (a product, an object, a tactile detail)
 * versus a narrative/hook/transition line. Intentionally not an AI call — the
 * chosen rule is "simple rule", not per-beat AI classification.
 *
 * Signal: the beat references a demonstrable noun (a product/material/object)
 * or a deictic "this/these/here" that, in a listicle, points at the item being
 * held up. Hook/framing lines ("do you really need to spend a fortune…"),
 * transitions, and closings lack these and read as full-frame breathers.
 */
export function narrationHasProductBeat(narration: string): boolean {
  const text = narration.toLowerCase();
  if (text.trim().length === 0) return false;
  // Deictic "show me this" pointers common when holding up an item.
  if (/\b(this|these|here'?s|meet|introducing)\b/.test(text)) return true;
  // Concrete demonstrable nouns (products / materials / tactile objects).
  const PRODUCT_NOUN =
    /\b(bottle|perfume|fragrance|scent|cream|serum|lotion|oil|balm|lipstick|mascara|powder|palette|brush|silk|satin|cashmere|linen|leather|velvet|pillow(?:case)?|sheet|robe|slipper|candle|vase|jewelry|jewellery|ring|necklace|bracelet|watch|bag|purse|scarf|glove|towel|soap|tea|coffee|chocolate|wine|glass|mug|plate|bowl|book|frame|flower|peony|peonies|rose|bloom)\b/;
  return PRODUCT_NOUN.test(text);
}


/** Canonical render encoding target. Every asset is normalized to this. */
export const RENDER_ENCODING = {
  fps: 30,
  videoCodec: 'libx264',
  pixelFormat: 'yuv420p',
  // CRF 20 + preset 'veryfast' encodes markedly faster than 18/'slow' with no
  // perceptible quality loss at 1080p — the final mux is the single-threaded
  // tail of a project (rendering queue is concurrency 1), so the preset directly
  // cuts wall-clock time. 'veryfast' vs 'fast'/'medium' is visually
  // indistinguishable at CRF 20; only step back up if artifacts show up in practice.
  crf: 20,
  preset: 'veryfast',
  audioCodec: 'aac',
  audioBitrateKbps: 320, // preserve voiceover fidelity
  audioSampleRate: 48_000,
} as const;

/** Default transition applied between segments in the render. */
export const TRANSITION = {
  type: 'crossfade' as const,
  durationSec: 0.8, // longer, softer dissolves between scenes
  // Ken Burns (slow zoom/pan) applied to still images to add life.
  kenBurnsZoom: 1.12,
  /**
   * Cap on how far a short background clip may be slowed (via PTS) to fill its
   * scene. Kept close to 1x so clips play at (near) NORMAL SPEED — earlier 3.2x
   * stretching read as unnatural slow-motion (client feedback). When even 1.2x
   * can't cover the scene (the provider returned clips much shorter than
   * assumed), the render seamlessly BOOMERANG-LOOPS the footage to length rather
   * than freezing a clone-padded tail — see buildBackgroundFill in @yulia/ffmpeg.
   */
  maxSlowFactor: 1.2,
  /**
   * Smooth ENDING: the finished film fades the picture to black and fades the
   * audio out over this many seconds instead of cutting hard on the last frame
   * (client: "end smoothly, not suddenly"). Clamped to ≤ half the total length
   * for pathologically short videos.
   */
  outroFadeSec: 1.2,
} as const;

/**
 * Picture-in-picture composite layout — the "Quiet Luxury" format: a wide
 * cinematic background video with a portrait "window" (a detail/product shot)
 * floated over it, alternating left/right per scene.
 *
 * Fractions are of the render canvas (see RENDER_DIMENSIONS); the renderer
 * resolves them to pixels. `overlaySide(sceneIndex)` gives the alternating
 * position so the segmenter and renderer agree without a DB column.
 */
export const PIP_LAYOUT = {
  overlayWidthFrac: 0.35, // 35% of canvas width
  overlayHeightFrac: 0.62, // 62% of canvas height (leaves lower-third for the title card)
  leftXFrac: 0.08, // left window: x at 8% (hug the edge)
  rightXFrac: 0.57, // right window: x at 57% (mirror of the left gutter)
  // CENTER overlay: a near-full-frame window that intentionally REPLACES the
  // background (lifestyle / mood / architecture beats — see OverlayPosition).
  // Wider + taller than the side gutter window; still inset a little so the soft
  // rounded corners + drop shadow read against the background rather than
  // bleeding to the canvas edge.
  centerWidthFrac: 0.86,
  centerHeightFrac: 0.72,
  cornerRadiusPx: 15,
  shadowOpacity: 0.2, // 20% black drop shadow
  shadowBlurPx: 24,
  shadowOffsetPx: 8,
  // Raise the window slightly above dead-center so the lower-left title card
  // has room. Fraction of canvas height; 0 = classic vertical center.
  verticalBiasFrac: 0.06,
  // The overlay "window" is an inset that PUNCTUATES the background rather than
  // covering it end-to-end: it enters a beat after the background starts and
  // exits before it ends (matching the reference edit). Offsets are in seconds
  // from the scene's start / end so they hold regardless of scene length.
  overlayStartOffsetSec: 0.6, // background plays alone before the window appears
  overlayEndOffsetSec: 0.6, // window exits this long before the scene ends
  minOverlayVisibleSec: 1.5, // floor so short/last scenes don't collapse the window
  // Very short fades so the overlay reads as SOLID for essentially its whole
  // on-screen life. Longer 0.5s fades left the image visibly semi-transparent
  // for ~20% of its ~5s visible span (client feedback: "make images solid").
  fadeInSec: 0.15, // near-instant window entrance
  fadeOutSec: 0.15, // matching quick exit
  // Aspect ratios requested from 69Labs per layer. Background is the render
  // orientation (wide); the overlay is a portrait detail/product shot.
  backgroundAspectRatio: '16:9',
  // Portrait overlay. Must be an aspect ratio the 69Labs image model accepts —
  // "Nano Banana 2" allows 1:1, 3:4, 4:3, 9:16, 16:9 (NOT 4:5). 3:4 is the
  // closest portrait option; the overlay is scaled into a fixed PIP window
  // (overlayWidthFrac × overlayHeightFrac) at render time, so the exact source
  // ratio isn't critical — it just has to be portrait and provider-valid.
  overlayAspectRatio: '3:4',
} as const;

/**
 * Recurring "interstitial" background: all full-frame (video-only) scenes share
 * the same establishing/breather PROMPT — the way the reference reuses its peony
 * establishing shot between items — so they stay in one world/grade. But instead
 * of one identical seed (which made a run of consecutive breathers the exact
 * same 8s clip repeated — "looping with one scene"), the seed rotates across
 * INTERSTITIAL_VARIANTS values by scene ordinal, so the breathers recur a small
 * FAMILY of establishing looks rather than a single frozen clip.
 */
export const INTERSTITIAL_SEED_KEY = 'interstitial';

/**
 * How many distinct establishing-look variants the recurring interstitial
 * rotates through (by scene ordinal). Small so the breathers still read as one
 * recurring world, but > 1 so consecutive breathers aren't the identical clip.
 */
export const INTERSTITIAL_VARIANTS = 3;

export type OverlaySide = 'left' | 'right';

/** Alternate the overlay window left/right by scene ordinal for visual rhythm. */
export function overlaySide(sceneIndex: number): OverlaySide {
  return sceneIndex % 2 === 0 ? 'left' : 'right';
}

/**
 * Resolve the overlay window's on-frame position for a scene. Prefers the AI
 * editing plan's chosen position (left/center/right — picked to preserve the
 * focal subject, per the reference spec's "don't alternate mechanically" rule);
 * falls back to the deterministic alternating `overlaySide()` when the scene was
 * prompted before the plan existed (so old projects render unchanged).
 */
export function resolveOverlayPosition(
  sceneIndex: number,
  planned: OverlayPosition | null | undefined,
): OverlayPosition {
  return planned ?? overlaySide(sceneIndex);
}

/**
 * Numbered section/item title card burned lower-left — e.g. "#1" over
 * "SIGNATURE SCENT" — shown only on the FIRST scene of each listicle item.
 * Elegant serif caps with a dark outline for legibility over any background.
 * Fractions are of the render canvas; seconds are offsets from the scene start.
 */
export const TITLE_CARD = {
  xFrac: 0.07, // 7% in from the left edge
  numberYFrac: 0.74, // "#N" baseline at 74% down
  titleYFrac: 0.79, // title baseline just below the number
  numberSizeFrac: 0.03, // "#N" ~3% of canvas height
  titleSizeFrac: 0.045, // title ~4.5% of canvas height
  color: 'white',
  borderColor: 'black@0.85',
  borderWidthPx: 4,
  appearOffsetSec: 0.4, // fade in shortly after the scene starts
  holdSec: 3.5, // fully visible for ~3.5s
  fadeSec: 0.5, // fade in / fade out duration
} as const;

/**
 * Warm "quiet luxury" color grade applied to the BACKGROUND layer only, so the
 * inset product window keeps its own punch and reads as a separate element.
 * eq + curves (no external LUT to ship); tune here without a rebuild of assets.
 */
export const COLOR_GRADE = {
  contrast: 1.04,
  brightness: 0.02, // lift shadows a hair
  saturation: 0.92, // muted, editorial
  gamma: 1.03,
  // Warm highlights toward champagne/ivory; pull blue down to kill any cool cast.
  rCurve: '0/0.03 0.5/0.55 1/1',
  gCurve: '0/0.0 0.5/0.5 1/0.98',
  bCurve: '0/0.0 0.5/0.45 1/0.94',
} as const;

/** Upper bounds to protect cost + queue health. */
export const LIMITS = {
  maxAudioDurationSec: 60 * 30, // 30 min voiceover
  maxAudioBytes: 500 * 1024 * 1024, // 500 MB
  maxScenesPerProject: 400,
  allowedAudioMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg'],
} as const;
