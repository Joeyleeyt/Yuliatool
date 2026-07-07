import { Queue } from 'bullmq';
import { getProducerConnection } from './connection.js';
import type { QueueName } from '@yulia/core';

/**
 * Central dead-letter queue. Jobs that exhaust their retries land here (in
 * addition to being marked `dead_letter` in the DB ledger) for inspection and
 * manual replay.
 */
export const DEAD_LETTER_QUEUE = 'dead-letter';

let dlq: Queue | null = null;

function getDlq(): Queue {
  if (!dlq) dlq = new Queue(DEAD_LETTER_QUEUE, { connection: getProducerConnection() });
  return dlq;
}

export interface DeadLetterRecord {
  originalQueue: QueueName;
  jobId: string;
  data: unknown;
  reason: string;
  failedAt: string;
}

export async function enqueueDeadLetter(
  originalQueue: QueueName,
  jobId: string,
  data: unknown,
  reason: string,
  failedAtIso: string,
): Promise<void> {
  const record: DeadLetterRecord = {
    originalQueue,
    jobId,
    data,
    reason,
    failedAt: failedAtIso,
  };
  await getDlq().add('dead-letter', record, { removeOnComplete: false, removeOnFail: false });
}
