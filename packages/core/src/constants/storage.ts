import { AssetKind } from '../enums/asset.js';

/**
 * R2 object-key layout. A single canonical scheme keeps assets discoverable and
 * makes per-project cleanup a prefix delete.
 *
 *   projects/{projectId}/voiceover/{assetId}.{ext}
 *   projects/{projectId}/scenes/{sceneId}/clip.{ext}
 *   projects/{projectId}/scenes/{sceneId}/image.{ext}
 *   projects/{projectId}/renders/{renderId}.mp4
 *   projects/{projectId}/tmp/{token}
 */
export const R2_PREFIX = {
  project: (projectId: string) => `projects/${projectId}`,
  voiceover: (projectId: string, assetId: string, ext: string) =>
    `projects/${projectId}/voiceover/${assetId}.${ext}`,
  sceneClip: (projectId: string, sceneId: string, ext: string) =>
    `projects/${projectId}/scenes/${sceneId}/clip.${ext}`,
  sceneImage: (projectId: string, sceneId: string, ext: string) =>
    `projects/${projectId}/scenes/${sceneId}/image.${ext}`,
  render: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.mp4`,
  thumbnail: (projectId: string, renderId: string) =>
    `projects/${projectId}/renders/${renderId}.jpg`,
  temp: (projectId: string, token: string) => `projects/${projectId}/tmp/${token}`,
} as const;

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
