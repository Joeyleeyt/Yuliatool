/**
 * One timeline scene. Videos and images are SEPARATE full-frame scenes (no
 * picture-in-picture): a scene is EITHER a video scene (`backgroundPaths`) OR a
 * full-frame image GALLERY (`imagePaths`) — exactly one is set.
 */
export interface RenderSegment {
  /**
   * VIDEO scene: local paths to the wide 16:9 clips, in sequence order, played
   * back-to-back (short crossfade) at normal speed to fill the scene. Absent for
   * an image scene.
   */
  backgroundPaths?: string[];
  /**
   * IMAGE GALLERY scene: local paths to the full-frame 16:9 stills, in slot
   * order. One still → a single Ken Burns hold; several → the stills rotate
   * (Ken Burns each + crossfade) across the whole on-screen span. Absent for a
   * video scene.
   */
  imagePaths?: string[];
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
