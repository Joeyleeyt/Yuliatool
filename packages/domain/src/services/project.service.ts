import {
  ProjectStatus,
  ProjectStateMachine,
  NotFoundError,
  ValidationError,
  R2_PREFIX,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectListQuery,
  type Paginated,
} from '@yulia/core';
import type { ProjectRow, ProjectListRow, OwnerActivityRow } from '@yulia/db';
import { purgeProject } from '@yulia/queue';
import type { AppContext } from '../context.js';
import { RecoveryService } from './recovery.service.js';

/**
 * Project lifecycle + CRUD. Ownership is enforced here: read/mutate methods
 * take the acting `ownerId` and throw NotFound (not Forbidden — don't leak
 * existence) when a project isn't owned by the caller.
 */
export class ProjectService {
  constructor(private readonly ctx: AppContext) {}

  async create(ownerId: string, input: CreateProjectInput): Promise<ProjectRow> {
    const project = await this.ctx.repos.projects.create({
      ownerId,
      title: input.title,
      description: input.description ?? null,
      renderFormat: input.renderFormat,
    });
    await this.ctx.repos.activity.log({
      projectId: project.id,
      actorId: ownerId,
      type: 'project_created',
      message: `Project "${project.title}" created`,
    });
    return project;
  }

  async get(id: string, ownerId: string): Promise<ProjectRow> {
    const project = await this.ctx.repos.projects.findByIdForOwner(id, ownerId);
    if (!project) throw new NotFoundError('Project', id);
    return project;
  }

  async list(ownerId: string, query: ProjectListQuery): Promise<Paginated<ProjectListRow>> {
    const { items, total } = await this.ctx.repos.projects.list({
      ownerId,
      limit: query.limit,
      offset: query.offset,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    return { items, total, limit: query.limit, offset: query.offset };
  }

  /** Cross-project activity feed for the dashboard — every event across the owner's productions. */
  async activity(ownerId: string, limit = 50): Promise<OwnerActivityRow[]> {
    return this.ctx.repos.activity.listByOwner(ownerId, limit, 0);
  }

  async update(id: string, ownerId: string, input: UpdateProjectInput): Promise<ProjectRow> {
    await this.get(id, ownerId); // ownership guard
    const updated = await this.ctx.repos.projects.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.renderFormat !== undefined ? { renderFormat: input.renderFormat } : {}),
    });
    if (!updated) throw new NotFoundError('Project', id);
    return updated;
  }

  /**
   * Delete the project, its queued jobs, and all its R2 objects. DB cascades
   * handle the rows. Order matters: purge the queue FIRST so no worker picks up
   * a job for a project that's about to vanish (which would 404 on every retry
   * and pollute the worker). Queue purge is best-effort — a transient Redis
   * issue must not block the authoritative DB + storage deletion.
   */
  async remove(id: string, ownerId: string): Promise<void> {
    await this.get(id, ownerId); // ownership guard
    try {
      const { removed, skipped } = await purgeProject(id);
      this.ctx.logger.info({ projectId: id, removed, skipped }, 'project queue jobs purged');
    } catch (err) {
      this.ctx.logger.warn({ projectId: id, err }, 'queue purge failed; continuing with delete');
    }
    await this.ctx.storage.deletePrefix(`${R2_PREFIX.project(id)}/`);
    await this.ctx.repos.projects.deleteById(id);
    this.ctx.logger.info({ projectId: id, ownerId }, 'project removed');
  }

  /**
   * Validated status transition. Used by upload finalize and (later) every
   * worker stage. Loads current status, asserts legality, persists, logs.
   */
  async transition(id: string, to: ProjectStatus): Promise<ProjectRow> {
    const current = await this.ctx.repos.projects.findById(id);
    if (!current) throw new NotFoundError('Project', id);
    ProjectStateMachine.assertTransition(current.status, to);
    const updated = await this.ctx.repos.projects.applyStatus(id, {
      status: to,
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    });
    await this.ctx.repos.activity.log({
      projectId: id,
      type: 'status_changed',
      message: `${current.status} → ${to}`,
      data: { from: current.status, to },
    });
    return updated!;
  }

  /**
   * Retry a FAILED project: re-plan from persisted state and re-dispatch the
   * earliest incomplete stage (force). Ownership-guarded.
   */
  async retry(id: string, ownerId: string): Promise<ProjectRow> {
    const project = await this.get(id, ownerId);
    if (project.status !== ProjectStatus.FAILED) {
      throw new ValidationError('Only failed projects can be retried', { status: project.status });
    }
    // Respect the global 1-by-1 queue: resume immediately only if the generation
    // slot is free; otherwise re-queue and let promotion resume it (from the
    // correct stage, since resume() re-plans from persisted artifacts).
    const decision = await this.ctx.repos.projects.tryStartOrQueue(id);
    if (decision === 'started') {
      await new RecoveryService(this.ctx).resume(id);
    }
    const updated = await this.ctx.repos.projects.findById(id);
    return updated!;
  }

  /** Move a project to FAILED from any active state, recording the cause. */
  async fail(id: string, error: { code: string; message: string }): Promise<ProjectRow> {
    const updated = await this.ctx.repos.projects.applyStatus(id, {
      status: ProjectStatus.FAILED,
      errorCode: error.code,
      errorMessage: error.message,
      failedAt: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError('Project', id);
    await this.ctx.repos.activity.log({
      projectId: id,
      type: 'project_failed',
      message: error.message,
      data: { code: error.code },
    });

    // A failed production frees the single generation slot — promote the next
    // queued project (no-op if the slot is still busy or nothing is queued).
    await new RecoveryService(this.ctx)
      .promoteNextQueued()
      .catch((err) => this.ctx.logger.error({ err, projectId: id }, 'queue: promote after failure failed'));

    return updated;
  }
}
