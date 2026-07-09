import { SceneVisualType } from '../enums/asset.js';

/**
 * Core pipeline constants. Central so the segmenter, prompt generator, worker
 * orchestration, and FFmpeg pipeline all agree on the same numbers.
 */

/** Target durations per visual type, in seconds. */
export const SEGMENT_DURATION = {
  [SceneVisualType.VIDEO]: 8,
  [SceneVisualType.IMAGE]: 5,
} as const;

/** Acceptable segmentation window the AI must target per scene. */
export const SEGMENT_WINDOW_SEC = { min: 5, max: 8 } as const;

/** How often the generation stage polls 69Labs for a result. */
export const GENERATION_POLL_INTERVAL_SEC = 8;

/**
 * The alternating visual pattern: even index -> video, odd index -> image.
 * Kept as a pure function so both the segmenter and renderer derive the same
 * type from a scene's ordinal position.
 */
export function visualTypeForIndex(index: number): SceneVisualType {
  return index % 2 === 0 ? SceneVisualType.VIDEO : SceneVisualType.IMAGE;
}

export function durationForIndex(index: number): number {
  return SEGMENT_DURATION[visualTypeForIndex(index)];
}

/** Canonical render encoding target. Every asset is normalized to this. */
export const RENDER_ENCODING = {
  fps: 30,
  videoCodec: 'libx264',
  pixelFormat: 'yuv420p',
  crf: 18, // visually lossless-ish; high quality for a luxury aesthetic
  preset: 'slow',
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
   * scene, instead of freezing the last frame. Keeps motion fluid without
   * extreme, unnatural slow-motion.
   */
  maxSlowFactor: 2.5,
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
  overlayHeightFrac: 0.7, // 70% of canvas height
  leftXFrac: 0.1, // left window: x at 10%
  rightXFrac: 0.55, // right window: x at 55%
  cornerRadiusPx: 15,
  shadowOpacity: 0.2, // 20% black drop shadow
  shadowBlurPx: 24,
  shadowOffsetPx: 8,
  fadeInSec: 0.8, // softer window entrance
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

export type OverlaySide = 'left' | 'right';

/** Alternate the overlay window left/right by scene ordinal for visual rhythm. */
export function overlaySide(sceneIndex: number): OverlaySide {
  return sceneIndex % 2 === 0 ? 'left' : 'right';
}

/** Upper bounds to protect cost + queue health. */
export const LIMITS = {
  maxAudioDurationSec: 60 * 30, // 30 min voiceover
  maxAudioBytes: 500 * 1024 * 1024, // 500 MB
  maxScenesPerProject: 400,
  allowedAudioMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg'],
} as const;
