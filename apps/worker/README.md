# @yulia/worker

Long-lived Fly.io process running BullMQ consumers. Owns all heavy, resumable work.

Target internal structure (filled across Phases 3–6):

```
apps/worker/
├── src/
│   ├── main.ts                   # boot: connect DB/Redis, register processors, health server, graceful shutdown
│   ├── health.ts                 # tiny TCP/HTTP health server on :8080 for Fly checks
│   ├── processors/
│   │   ├── transcription.ts      # Deepgram -> transcripts
│   │   ├── analysis.ts           # OpenAI global analysis + scene segmentation
│   │   ├── prompt-generation.ts  # OpenAI -> per-scene 69Labs prompts
│   │   ├── video-generation.ts   # 69Labs submit/poll (Veo3 8s clips)
│   │   ├── image-generation.ts   # 69Labs submit/poll (5s stills)
│   │   ├── download-assets.ts    # provider result URL -> R2
│   │   ├── rendering.ts          # @yulia/ffmpeg pipeline -> final MP4 -> R2
│   │   └── thumbnail.ts          # (future)
│   ├── orchestration/            # state-machine advancement + fan-out/fan-in
│   └── runtime/                  # DI container, retry/DLQ wiring, idempotency guards
└── tsconfig.json
```

Reliability contract (Phase 5/8):
- **Idempotent**: every processor is safe to re-run; it checks DB state before acting.
- **Resumable**: on boot, reconcile in-flight `jobs`/`assets` rows against provider status.
- **Retry + backoff + DLQ**: from `QUEUE_RETRY_POLICY`; exhausted jobs → dead-letter + activity log.
- **Graceful shutdown**: drain active jobs on SIGTERM before exit (Fly deploy/restart safe).
```
