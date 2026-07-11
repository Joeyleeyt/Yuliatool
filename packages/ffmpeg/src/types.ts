import type { OverlaySide } from '@yulia/core';

export interface RenderSegment {
  /**
   * Local paths to the wide 16:9 background video clips, in sequence order.
   * A scene is filled by playing these ~8s clips back-to-back (with a short
   * crossfade) at normal speed, so it fills the scene without stretching or
   * freezing a single clip. Always has at least one entry.
   */
  backgroundPaths: string[];
  /**
   * Local paths to the portrait overlay stills (the PiP "window"), in rotation
   * order. Empty for full-frame, video-only "breather" scenes. When it has 2+
   * entries the window rotates through them within the scene (~5–8s each).
   */
  overlayPaths: string[];
  /** Which side the overlay window sits on for this scene. */
  overlaySide: OverlaySide;
  /** On-screen duration this segment must occupy for audio sync. */
  displayDurationSec: number;
  /**
   * Listicle item title (e.g. "Signature Scent"), set ONLY on the first scene
   * of each numbered item. When present, a title card is burned lower-left.
   */
  titleText?: string;
  /** The item's ordinal (1-based), rendered as "#N". Paired with titleText. */
  itemNumber?: number;
}

export interface RenderProgress {
  percent: number; // 0..100
  stage: 'normalize' | 'concat' | 'mux';
}

export interface RenderInput {
  segments: RenderSegment[];
  voiceoverPath: string;
  outputPath: string;
  width: number;
  height: number;
  workDir: string;
  onProgress?: (p: RenderProgress) => void;
}

export interface RenderOutput {
  outputPath: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}
