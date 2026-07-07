import type { Sql } from '../client.js';
import { UserRepository } from './user.repository.js';
import { ProjectRepository } from './project.repository.js';
import { AssetRepository } from './asset.repository.js';
import { ActivityLogRepository } from './activity-log.repository.js';
import { TranscriptRepository } from './transcript.repository.js';
import { JobRepository } from './job.repository.js';
import { GenerationHistoryRepository } from './generation-history.repository.js';
import { AnalysisRepository } from './analysis.repository.js';
import { SceneRepository } from './scene.repository.js';
import { PromptRepository } from './prompt.repository.js';
import { RenderRepository } from './render.repository.js';

export * from './base.repository.js';
export * from './user.repository.js';
export * from './project.repository.js';
export * from './asset.repository.js';
export * from './activity-log.repository.js';
export * from './transcript.repository.js';
export * from './job.repository.js';
export * from './generation-history.repository.js';
export * from './analysis.repository.js';
export * from './scene.repository.js';
export * from './prompt.repository.js';
export * from './render.repository.js';

/** The full repository set, constructed over a single connection. */
export interface Repositories {
  users: UserRepository;
  projects: ProjectRepository;
  assets: AssetRepository;
  activity: ActivityLogRepository;
  transcripts: TranscriptRepository;
  jobs: JobRepository;
  generationHistory: GenerationHistoryRepository;
  analyses: AnalysisRepository;
  scenes: SceneRepository;
  prompts: PromptRepository;
  renders: RenderRepository;
}

export function createRepositories(sql: Sql): Repositories {
  return {
    users: new UserRepository(sql),
    projects: new ProjectRepository(sql),
    assets: new AssetRepository(sql),
    activity: new ActivityLogRepository(sql),
    transcripts: new TranscriptRepository(sql),
    jobs: new JobRepository(sql),
    generationHistory: new GenerationHistoryRepository(sql),
    analyses: new AnalysisRepository(sql),
    scenes: new SceneRepository(sql),
    prompts: new PromptRepository(sql),
    renders: new RenderRepository(sql),
  };
}
