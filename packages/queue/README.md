# @yulia/queue

Typed BullMQ layer shared by `web` (producer) and `worker` (consumer). Owns:

- **Queue registry** — one `Queue` per `QueueName` (see `@yulia/core`).
- **Typed job payloads** — a Zod schema + TS type per job so enqueue and consume can never disagree on shape.
- **Enqueue helpers** — set deterministic `jobId` (idempotency), retry policy, and backoff from `QUEUE_RETRY_POLICY`.
- **Dead-letter handling** — exhausted jobs move to a `:dlq` queue and flip the DB `jobs` row to `dead_letter`.

Idempotency contract: `jobId = \`${projectId}:${queue}:${sceneId ?? 'project'}\``. Re-enqueue after a crash is a no-op — no duplicate 69Labs spend.

Implemented in **Phase 5** (generation) with the transcription/analysis queues stubbed earlier as needed.
