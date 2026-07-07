import type { SceneVisualType } from '@yulia/core';

export interface RenderSegment {
  /** Local path to the downloaded scene asset (clip or still). */
  path: string;
  type: SceneVisualType;
  /** On-screen duration this segment must occupy for audio sync. */
  displayDurationSec: number;
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
