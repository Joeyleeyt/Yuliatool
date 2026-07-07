import type { Job, Processor } from 'bullmq';
import { QueueName, createLogger } from '@yulia/core';
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

    try {
      await handler(payload, ctx);
      await ctx.jobs.markCompleted(key);
      log.info({ jobId: key, ms: Date.now() - startedAt }, 'job completed');
    } catch (err) {
      const attemptsAllowed = job.opts.attempts ?? 1;
      const isFinal = job.attemptsMade + 1 >= attemptsAllowed;
      const errorJson = serializeError(err);

      await ctx.jobs.recordFailure(key, errorJson as unknown as Json, isFinal);
      log.error(
        { jobId: key, attempt: job.attemptsMade + 1, attemptsAllowed, isFinal, err },
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
      throw err; // hand back to BullMQ for retry/backoff bookkeeping
    }
  };
}
