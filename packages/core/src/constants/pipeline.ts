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
  durationSec: 0.5,
  // Ken Burns (slow zoom/pan) applied to still images to add life.
  kenBurnsZoom: 1.08,
} as const;

/** Upper bounds to protect cost + queue health. */
export const LIMITS = {
  maxAudioDurationSec: 60 * 30, // 30 min voiceover
  maxAudioBytes: 500 * 1024 * 1024, // 500 MB
  maxScenesPerProject: 400,
  allowedAudioMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg'],
} as const;
