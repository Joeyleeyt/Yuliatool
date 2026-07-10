import { UnrecoverableError, type Job, type Processor } from 'bullmq';
import { QueueName, createLogger, isRetryable } from '@yulia/core';
import { PAYLOAD_SCHEMAS, type QueuePayloadMap } from '@yulia/queue';
import { ProjectService, type AppContext } from '@yulia/domain';
import type { Json } from '@yulia/db';

export type ProcessorHandler<Q extends QueueName> = (
  payload: QueuePayloadMap[Q],
  ctx: AppContext,
) => Promise<void>;

function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  }
  return { name: 'UnknownError', message: String(err) };
}

/**
 * Wrap a business handler in the standard job lifecycle:
 *   validate payload -> ledger:active -> run -> ledger:completed
 *   on error: ledger:failure(attempt); on final attempt: dead-letter + fail the
 *   owning project. Rethrows so BullMQ applies retry/backoff.
 *
 * Handlers stay pure business logic; all durability/observability lives here.
 */
export function defineProcessor<Q extends QueueName>(
  queue: Q,
  handler: ProcessorHandler<Q>,
  ctx: AppContext,
): Processor {
  const log = createLogger({ component: 'processor', queue });

  return async (job: Job) => {
    const key = job.id ?? '';
    const payload = PAYLOAD_SCHEMAS[queue].parse(job.data) as QueuePayloadMap[Q];

    await ctx.jobs.markActive(key, job.id ?? null);
    const startedAt = Date.now();
    const ids = payload as { projectId?: string; sceneId?: string };
    log.info(
      { jobId: key, attempt: job.attemptsMade + 1, projectId: ids.projectId, sceneId: ids.sceneId },
      'job started',
    );

    try {
      await handler(payload, ctx);
      await ctx.jobs.markCompleted(key);
      log.info({ jobId: key, ms: Date.now() - startedAt }, 'job completed');
    } catch (err) {
      // An error the handler marked non-retryable (e.g. NotFoundError for a
      // project deleted mid-run) must not keep retrying just because BullMQ's
      // own `attempts` budget isn't exhausted yet — without this, a deleted
      // project's in-flight job (skipped by purgeProject because it was
      // active/locked at delete time) burns all 6 attempts with backoff
      // instead of failing on the first one.
      const nonRetryable = !isRetryable(err);
      const attemptsAllowed = job.opts.attempts ?? 1;
      const isFinal = nonRetryable || job.attemptsMade + 1 >= attemptsAllowed;
      const errorJson = serializeError(err);

      await ctx.jobs.recordFailure(key, errorJson as unknown as Json, isFinal);
      log.error(
        { jobId: key, attempt: job.attemptsMade + 1, attemptsAllowed, isFinal, nonRetryable, err },
        'job failed',
      );

      if (isFinal) {
        await ctx.jobs.deadLetter(queue, key, job.data, errorJson.message, new Date().toISOString());
        const projectId = (payload as { projectId?: string }).projectId;
        if (projectId) {
          await new ProjectService(ctx)
            .fail(projectId, { code: 'JOB_FAILED', message: `${queue}: ${errorJson.message}` })
            .catch((e: unknown) => log.error({ e }, 'failed to mark project FAILED'));
        }
      }

      // UnrecoverableError tells BullMQ to move the job straight to `failed`
      // regardless of remaining attempts — the natural way to express "this
      // is done retrying" for a non-retryable error without also stopping a
      // genuinely-retryable one on its last attempt (which reaches isFinal too).
      if (nonRetryable) throw new UnrecoverableError(errorJson.message);
      throw err; // hand back to BullMQ for retry/backoff bookkeeping
    }
  };
}
