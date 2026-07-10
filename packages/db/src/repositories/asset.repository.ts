import type { AssetKind, AssetStatus } from '@yulia/core';
import type { Sql } from '../client.js';
import type { AssetRow } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

export interface CreateAssetData {
  projectId: string;
  sceneId?: string | null;
  kind: AssetKind;
  status?: AssetStatus;
  contentType?: string | null;
  r2Bucket?: string | null;
  r2Key?: string | null;
  /** Free-form metadata (e.g. `{ slot }` for a rotated overlay image). */
  metadata?: Record<string, unknown> | null;
}

export interface StoredMediaData {
  r2Bucket: string;
  r2Key: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export class AssetRepository extends BaseRepository<AssetRow> {
  constructor(sql: Sql) {
    super(sql, 'assets');
  }

  async create(data: CreateAssetData): Promise<AssetRow> {
    const rows = await this.sql<AssetRow[]>`
      insert into assets (project_id, scene_id, kind, status, content_type, r2_bucket, r2_key, metadata)
      values (
        ${data.projectId}, ${data.sceneId ?? null}, ${data.kind},
        ${data.status ?? 'pending'}, ${data.contentType ?? null},
        ${data.r2Bucket ?? null}, ${data.r2Key ?? null},
        ${this.sql.json((data.metadata ?? {}) as never)}
      )
      returning *`;
    return rows[0]!;
  }

  /**
   * A scene's overlay image at a given rotation `slot` (0-based). Slots are
   * stored in `metadata.slot`; slot 0 also matches legacy rows that predate the
   * multi-overlay model (no slot key -> treated as slot 0).
   */
  async findSceneImageBySlot(sceneId: string, kind: AssetKind, slot: number): Promise<AssetRow | null> {
    const rows = await this.sql<AssetRow[]>`
      select * from assets
      where scene_id = ${sceneId} and kind = ${kind}
        and coalesce((metadata->>'slot')::int, 0) = ${slot}
      order by created_at desc limit 1`;
    return rows[0] ?? null;
  }

  /** All of a scene's images of `kind`, ordered by rotation slot then age. */
  async listSceneImages(sceneId: string, kind: AssetKind): Promise<AssetRow[]> {
    return this.sql<AssetRow[]>`
      select * from assets
      where scene_id = ${sceneId} and kind = ${kind}
      order by coalesce((metadata->>'slot')::int, 0) asc, created_at asc`;
  }

  async findByProject(projectId: string, kind?: AssetKind): Promise<AssetRow[]> {
    return this.sql<AssetRow[]>`
      select * from assets
      where project_id = ${projectId}
      ${kind ? this.sql`and kind = ${kind}` : this.sql``}
      order by created_at asc`;
  }

  async findBySceneAndKind(sceneId: string, kind: AssetKind): Promise<AssetRow | null> {
    const rows = await this.sql<AssetRow[]>`
      select * from assets where scene_id = ${sceneId} and kind = ${kind}
      order by created_at desc limit 1`;
    return rows[0] ?? null;
  }

  /** Record a submitted generation (provider + external id). */
  async setSubmitted(
    id: string,
    data: { provider: 'sixtynine_labs'; externalId: string },
  ): Promise<void> {
    await this.sql`
      update assets set status = 'submitted', provider = ${data.provider},
        external_id = ${data.externalId}
      where id = ${id}`;
  }

  /** Record a completed generation result URL (pre-R2 download). */
  async setGenerated(id: string, sourceUrl: string): Promise<void> {
    await this.sql`
      update assets set status = 'generated', source_url = ${sourceUrl} where id = ${id}`;
  }

  /** Reset a failed generation so a retry resubmits from scratch. */
  async clearGeneration(id: string): Promise<void> {
    await this.sql`
      update assets set status = 'pending', external_id = null, source_url = null where id = ${id}`;
  }

  async updateStatus(id: string, status: AssetStatus): Promise<void> {
    await this.sql`update assets set status = ${status} where id = ${id}`;
  }

  /**
   * Point one asset at ANOTHER already-stored asset's R2 object (shared key, no
   * copy). Used by the download-stage fallback: when a scene's own background
   * can't be produced, its VIDEO_CLIP asset reuses a similar scene's stored clip
   * so the render resolves a valid object. Both rows then reference the same R2
   * object; deletion is by project cascade, so sharing a key is safe.
   */
  async reuseStoredObject(id: string, donorAssetId: string): Promise<AssetRow | null> {
    const rows = await this.sql<AssetRow[]>`
      update assets t set
        status = 'stored',
        r2_bucket = d.r2_bucket,
        r2_key = d.r2_key,
        content_type = d.content_type,
        size_bytes = d.size_bytes,
        checksum_sha256 = d.checksum_sha256,
        width = d.width,
        height = d.height,
        duration_sec = d.duration_sec,
        source_url = null
      from assets d
      where t.id = ${id} and d.id = ${donorAssetId}
      returning t.*`;
    return rows[0] ?? null;
  }

  /** Mark an asset as stored in R2 with its probed media metadata. */
  async markStored(id: string, data: StoredMediaData): Promise<AssetRow | null> {
    const rows = await this.sql<AssetRow[]>`
      update assets set
        status = 'stored',
        r2_bucket = ${data.r2Bucket},
        r2_key = ${data.r2Key},
        content_type = ${data.contentType},
        size_bytes = ${data.sizeBytes},
        checksum_sha256 = ${data.checksumSha256 ?? null},
        width = ${data.width ?? null},
        height = ${data.height ?? null},
        duration_sec = ${data.durationSec ?? null}
      where id = ${id}
      returning *`;
    return rows[0] ?? null;
  }
}
