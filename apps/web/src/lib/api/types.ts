import type {
  ProjectRow,
  SceneRow,
  PromptRow,
  AssetRow,
  TranscriptRow,
  RenderRow,
  ActivityLogRow,
} from '@yulia/db';

// Re-export row shapes as the API DTOs (server returns them directly).
export type { ProjectRow, SceneRow, PromptRow, AssetRow, TranscriptRow, RenderRow, ActivityLogRow };

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatusView {
  status: ProjectRow['status'];
  totalScenes: number;
  completedScenes: number;
  progress: number;
  errorMessage: string | null;
  /** When the pipeline started (project creation). ISO 8601. */
  startedAt: string;
  /** When the project reached COMPLETED, or null while running. ISO 8601. */
  completedAt: string | null;
  /** Total generation seconds once COMPLETED; null while running (UI ticks live). */
  durationSec: number | null;
  /** 1-based place in the global 1-by-1 queue while QUEUED; null otherwise. */
  queuePosition: number | null;
}

export interface SceneView extends SceneRow {
  prompt: PromptRow | null;
  assetUrl: string | null;
  assetStatus: string | null;
}

export interface AssetView extends AssetRow {
  url: string | null;
}

export interface RenderView {
  render: RenderRow | null;
  url: string | null;
  downloadUrl: string | null;
}

export interface UploadTicket {
  assetId: string;
  upload: { url: string; key: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
}
