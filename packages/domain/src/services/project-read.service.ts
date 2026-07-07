import { ProjectStatus, SIGNED_URL_TTL } from '@yulia/core';
import type {
  ProjectRow,
  SceneRow,
  PromptRow,
  AssetRow,
  TranscriptRow,
  RenderRow,
  ActivityLogRow,
} from '@yulia/db';
import type { AppContext } from '../context.js';
import { ProjectService } from './project.service.js';

export interface StatusView {
  status: ProjectStatus;
  totalScenes: number;
  completedScenes: number;
  progress: number;
  errorMessage: string | null;
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
}

export interface CostView {
  totalUsd: number;
  totalOperations: number;
  byProvider: { provider: string; operations: number; costUsd: number }[];
}

/**
 * Read-side queries for the dashboard. All methods enforce ownership (via
 * ProjectService.get) and mint short-lived signed R2 URLs for playback.
 */
export class ProjectReadService {
  private readonly projects: ProjectService;

  constructor(private readonly ctx: AppContext) {
    this.projects = new ProjectService(ctx);
  }

  async status(projectId: string, ownerId: string): Promise<StatusView> {
    const project = await this.projects.get(projectId, ownerId);
    return {
      status: project.status,
      totalScenes: project.total_scenes,
      completedScenes: project.completed_scenes,
      progress: computeProgress(project),
      errorMessage: project.error_message,
    };
  }

  async transcript(projectId: string, ownerId: string): Promise<TranscriptRow | null> {
    await this.projects.get(projectId, ownerId);
    return this.ctx.repos.transcripts.findByProject(projectId);
  }

  async activity(projectId: string, ownerId: string): Promise<ActivityLogRow[]> {
    await this.projects.get(projectId, ownerId);
    return this.ctx.repos.activity.listByProject(projectId, 100, 0);
  }

  async scenes(projectId: string, ownerId: string): Promise<SceneView[]> {
    await this.projects.get(projectId, ownerId);
    const [scenes, prompts, assets] = await Promise.all([
      this.ctx.repos.scenes.listByProject(projectId),
      this.ctx.repos.prompts.listActiveByProject(projectId),
      this.ctx.repos.assets.findByProject(projectId),
    ]);

    const promptByScene = new Map(prompts.map((p) => [p.scene_id, p]));
    const assetByScene = new Map(assets.filter((a) => a.scene_id).map((a) => [a.scene_id!, a]));

    return Promise.all(
      scenes.map(async (scene): Promise<SceneView> => {
        const asset = assetByScene.get(scene.id) ?? null;
        const url =
          asset?.status === 'stored' && asset.r2_key
            ? await this.ctx.storage.createSignedDownloadUrl(asset.r2_key, SIGNED_URL_TTL.downloadSec)
            : null;
        return {
          ...scene,
          prompt: promptByScene.get(scene.id) ?? null,
          assetUrl: url,
          assetStatus: asset?.status ?? null,
        };
      }),
    );
  }

  async assets(projectId: string, ownerId: string): Promise<AssetView[]> {
    await this.projects.get(projectId, ownerId);
    const assets = await this.ctx.repos.assets.findByProject(projectId);
    return Promise.all(
      assets.map(async (asset): Promise<AssetView> => ({
        ...asset,
        url:
          asset.status === 'stored' && asset.r2_key
            ? await this.ctx.storage.createSignedDownloadUrl(asset.r2_key, SIGNED_URL_TTL.downloadSec)
            : null,
      })),
    );
  }

  /** Cost + call-count rollup, cached in Redis (30s) — aggregation is heavier. */
  async cost(projectId: string, ownerId: string): Promise<CostView> {
    await this.projects.get(projectId, ownerId);
    return this.ctx.cache.remember(`cost:${projectId}`, 30, async () => {
      const byProvider = await this.ctx.repos.generationHistory.costSummary(projectId);
      return {
        totalUsd: byProvider.reduce((s, r) => s + r.costUsd, 0),
        totalOperations: byProvider.reduce((s, r) => s + r.operations, 0),
        byProvider,
      };
    });
  }

  async render(projectId: string, ownerId: string): Promise<RenderView> {
    await this.projects.get(projectId, ownerId);
    const render = await this.ctx.repos.renders.findLatestByProject(projectId);
    if (!render?.asset_id) return { render, url: null };
    const asset = await this.ctx.repos.assets.findById(render.asset_id);
    const url =
      asset?.r2_key != null
        ? await this.ctx.storage.createSignedDownloadUrl(asset.r2_key, SIGNED_URL_TTL.downloadSec)
        : null;
    return { render, url };
  }
}

/** Coarse 0..100 progress from lifecycle stage + per-scene fan-out completion. */
function computeProgress(project: ProjectRow): number {
  const { status, completed_scenes: done, total_scenes: total } = project;
  switch (status) {
    case ProjectStatus.COMPLETED:
      return 100;
    case ProjectStatus.CREATED:
      return 2;
    case ProjectStatus.UPLOADING_AUDIO:
      return 6;
    case ProjectStatus.TRANSCRIBING:
      return 15;
    case ProjectStatus.ANALYZING:
      return 25;
    case ProjectStatus.SEGMENTING:
      return 32;
    case ProjectStatus.PROMPT_GENERATION:
      return 40;
    case ProjectStatus.VIDEO_GENERATION:
    case ProjectStatus.IMAGE_GENERATION:
    case ProjectStatus.WAITING_ASSETS:
      return 45 + (total > 0 ? Math.round((done / total) * 40) : 0);
    case ProjectStatus.RENDERING:
      return 90;
    case ProjectStatus.FAILED:
    default:
      return 0;
  }
}
