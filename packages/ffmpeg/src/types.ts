/**
 * One timeline scene. Videos and images are now SEPARATE full-frame scenes (no
 * picture-in-picture): a scene is EITHER a video scene (`backgroundPaths`) OR a
 * full-frame image scene (`imagePath`) — exactly one is set.
 */
export interface RenderSegment {
  /**
   * VIDEO scene: local paths to the wide 16:9 clips, in sequence order, played
   * back-to-back (short crossfade) at normal speed to fill the scene. Empty for
   * an image scene.
   */
  backgroundPaths: string[];
  /**
   * IMAGE scene: local path to the single full-frame 16:9 still, rendered with a
   * slow Ken Burns move to fill the whole screen. Undefined for a video scene.
   */
  imagePath?: string;
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
