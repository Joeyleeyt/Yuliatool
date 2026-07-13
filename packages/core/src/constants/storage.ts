import { AssetKind } from '../enums/asset.js';

/**
 * R2 object-key layout. A single canonical scheme keeps assets discoverable and
 * makes per-project cleanup a prefix delete.
 *
 *   projects/{projectId}/voiceover/{assetId}.{ext}
 *   projects/{projectId}/scenes/{sceneId}/clip.{ext}         (background slot 0)
 *   projects/{projectId}/scenes/{sceneId}/clip_{slot}.{ext}  (background slot 1+)
 *   projects/{projectId}/scenes/{sceneId}/image.{ext}        (overlay slot 0)
 *   projects/{projectId}/scenes/{sceneId}/image_{slot}.{ext} (overlay slot 1+)
 *   projects/{projectId}/renders/{renderId}.mp4
 *   projects/{projectId}/tmp/{token}
 */
export const R2_PREFIX = {
  project: (projectId: string) => `projects/${projectId}`,
  // GLOBAL background-music track — one file shared by EVERY render (not project-
  // scoped), so it lives at a fixed top-level key. Uploaded once (out of band, via
  // the R2 dashboard); the render fetches it if present and mixes it under the
  // voiceover, and silently skips music if the object is absent. See MUSIC_KEY.
  music: () => MUSIC_KEY,
  voiceover: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/voiceover/${assetId}.${ext}`,
  // A scene may hold multiple background clips (played back-to-back to fill the
  // scene at normal speed). `slot` discriminates them; slot 0 keeps the legacy
  // `clip.{ext}` key so existing single-clip backgrounds still resolve.
  sceneClip: (projectId: string, sceneId: string, ext: string, slot = 0) =>
    slot === 0
      ? `projects/${projectId}/scenes/${sceneId}/clip.${ext}`
      : `projects/${projectId}/scenes/${sceneId}/clip_${slot}.${ext}`,
  // A scene may hold multiple overlay images (rotated within the scene). `slot`
  // discriminates them; slot 0 keeps the legacy `image.{ext}` key so existing
  // single-overlay assets still resolve.
  sceneImage: (projectId: string, sceneId: string, ext: string, slot = 0) =>
    slot === 0
      ? `projects/${projectId}/scenes/${sceneId}/image.${ext}`
      : `projects/${projectId}/scenes/${sceneId}/image_${slot}.${ext}`,
  render: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.mp4`,
  thumbnail: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.jpg`,
  temp: (projectId: string, token: string) => `projects/${projectId}/tmp/${token}`,
} as const;

/**
 * Fixed R2 key for the global background-music track. Upload one MP3 here (via
 * the R2 dashboard) and every render mixes it under the voiceover; if no object
 * exists at this key the render is voiceover-only (no error). Kept as an MP3 at
 * a stable name so the upload target never changes.
 */
export const MUSIC_KEY = 'music/background.mp3';

/**
 * Background-music mix defaults. `duckDb` is how far BELOW the voiceover the
 * music sits (negative dB = quieter); -20 dB is clearly audible but never
 * competes with speech. The render loops the track to the full video length and
 * mixes it under the voiceover (no fades — plays flat, per client). Exposed via
 * env (MUSIC_DUCK_DB) so it's tunable after hearing a render without a rebuild.
 */
export const MUSIC_MIX = { duckDb: -20 } as const;

export const ASSET_KIND_EXT: Partial<Record<AssetKind, string>> = {
  [AssetKind.VIDEO_CLIP]: 'mp4',
  [AssetKind.IMAGE]: 'png',
  [AssetKind.RENDER]: 'mp4',
  [AssetKind.THUMBNAIL]: 'jpg',
};

/** Signed URL default lifetimes. */
export const SIGNED_URL_TTL = {
  uploadSec: 60 * 15, // 15 min to complete an upload
  downloadSec: 60 * 60, // 1 hr playback/download link
} as const;
