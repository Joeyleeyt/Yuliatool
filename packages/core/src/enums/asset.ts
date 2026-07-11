/**
 * Asset taxonomy. `AssetKind` describes what the binary *is*; `AssetStatus`
 * tracks its generation/download lifecycle inside a scene.
 */
export const AssetKind = {
  VOICEOVER: 'voiceover', // original uploaded narration
  VIDEO_CLIP: 'video_clip', // Veo3-generated 8s clip
  IMAGE: 'image', // 5s still (rendered as a hold)
  RENDER: 'render', // final concatenated MP4
  THUMBNAIL: 'thumbnail',
  TEMP: 'temp',
} as const;

export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

/** Whether a scene's visual is a moving clip or a still image. Alternates. */
export const SceneVisualType = {
  VIDEO: 'video',
  IMAGE: 'image',
} as const;

export type SceneVisualType = (typeof SceneVisualType)[keyof typeof SceneVisualType];

/**
 * Where the overlay "window" sits on the frame — the editing-plan analog of the
 * reference spec's overlay position. `left`/`right` keep the PiP window at a
 * gutter (the presenter/focal subject stays visible on the other side); `center`
 * is a full-width, near-full-frame overlay that intentionally REPLACES the
 * background (lifestyle / mood / architecture beats). Chosen per-overlay by the
 * AI plan; falls back to the alternating `overlaySide()` when unset.
 */
export const OverlayPosition = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
} as const;

export type OverlayPosition = (typeof OverlayPosition)[keyof typeof OverlayPosition];

/**
 * Per-overlay camera motion (the reference spec's allowed motions). Drives how a
 * still overlay is animated in the render (zoompan/crop expressions), replacing
 * the previous fixed Ken Burns push-in. `static` holds still; the rest drift or
 * zoom gently. Chosen per-overlay by the AI plan; falls back to a soft
 * slow-zoom-in when unset (matching the old behavior).
 */
export const OverlayMotion = {
  STATIC: 'static',
  SLOW_ZOOM_IN: 'slow_zoom_in',
  SLOW_ZOOM_OUT: 'slow_zoom_out',
  PAN_LEFT: 'pan_left',
  PAN_RIGHT: 'pan_right',
  DRIFT_UP: 'drift_up',
  DRIFT_DOWN: 'drift_down',
} as const;

export type OverlayMotion = (typeof OverlayMotion)[keyof typeof OverlayMotion];

/**
 * How an overlay enters (the reference spec's allowed transitions). The render
 * engine already crossfades scene-to-scene; this drives the overlay window's own
 * entrance within its scene. `crossfade`/`fade` are soft alpha fades; `hard_cut`
 * pops in with no fade (fast product lists); `fade_to_white` flashes through a
 * white wash (new-chapter beats). Falls back to `crossfade` when unset.
 */
export const OverlayTransition = {
  CROSSFADE: 'crossfade',
  FADE: 'fade',
  HARD_CUT: 'hard_cut',
  FADE_TO_WHITE: 'fade_to_white',
} as const;

export type OverlayTransition = (typeof OverlayTransition)[keyof typeof OverlayTransition];

export const AssetStatus = {
  PENDING: 'pending', // no generation submitted yet
  SUBMITTED: 'submitted', // 69Labs job created, awaiting result
  GENERATED: 'generated', // provider produced a result URL
  DOWNLOADING: 'downloading',
  STORED: 'stored', // persisted in R2, key recorded
  FAILED: 'failed',
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

/** Render output orientations we support out of the box. */
export const RenderFormat = {
  VERTICAL_1080x1920: 'vertical_1080x1920',
  HORIZONTAL_1920x1080: 'horizontal_1920x1080',
} as const;

export type RenderFormat = (typeof RenderFormat)[keyof typeof RenderFormat];

export const RENDER_DIMENSIONS: Record<RenderFormat, { width: number; height: number }> = {
  [RenderFormat.VERTICAL_1080x1920]: { width: 1080, height: 1920 },
  [RenderFormat.HORIZONTAL_1920x1080]: { width: 1920, height: 1080 },
};
