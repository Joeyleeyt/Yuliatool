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
