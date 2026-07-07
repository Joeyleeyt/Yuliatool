# yulia-video

Production platform that turns a **voiceover audio file** into a finished, cinematic **YouTube MP4** — alternating 8-second AI video clips (Veo3 via 69Labs) and 5-second AI stills, narratively driven by the narration and rendered with FFmpeg.

> **Status:** Phase 1 complete — architecture, folder structure, database schema, infrastructure. Later phases build on this foundation without changing it.

---

## Architecture at a glance

```
                    ┌──────────────────────────────────────────────┐
  Browser  ───────► │  apps/web  (Next.js App Router)               │
                    │  • validate + auth (Supabase)                 │
                    │  • issue signed R2 upload URLs                │
                    │  • enqueue jobs, read state (NO heavy work)   │
                    └───────────────┬──────────────────────────────┘
                                    │ enqueue (BullMQ / Upstash Redis)
                                    ▼
                    ┌──────────────────────────────────────────────┐
  Deepgram ◄──────► │  apps/worker  (Fly.io, long-lived)            │
  OpenAI   ◄──────► │  transcription → analysis → segmentation →   │
  69Labs   ◄──────► │  prompts → video/image gen → download → FFmpeg│
                    └───────────────┬──────────────────────────────┘
                                    │
              Postgres/Supabase ◄───┴───► Cloudflare R2 (all binaries)
              (metadata, json, status)     (audio, clips, images, renders)
```

**Load-bearing principles**

1. **DB is the source of truth.** `projects.status` drives a data-driven state machine; workers read state and ask `ProjectStateMachine.nextStatus()` rather than trusting in-memory flow. → resumable after any crash/restart.
2. **Request path ≠ work path.** HTTP handlers only validate + enqueue + read. Everything expensive is a BullMQ job on a Fly worker.
3. **Idempotency by construction.** Deterministic job IDs (`${projectId}:${queue}:${sceneId}`) make re-enqueue a no-op — no duplicate paid generations.
4. **Providers behind interfaces.** OpenAI / Deepgram / 69Labs / R2 each sit behind `@yulia/services`; the generation providers share `submit()/poll()/download()`.

## Monorepo layout

```
apps/
  web/        Next.js UI + thin API (enqueue + read)
  worker/     Fly.io BullMQ consumers (all heavy work)
packages/
  core/       env, enums, constants, state machine, errors, logger   ← the shared kernel
  db/         SQL migrations, row types, Postgres client (repositories land in Phase 2)
  services/   R2 · Redis · Deepgram · OpenAI · 69Labs abstractions
  queue/      typed BullMQ queues + job contracts
  ffmpeg/     rendering pipeline (normalize → transitions → concat → mux)
infra/
  fly/        web + worker fly.toml
  docker/     web + worker Dockerfiles (worker ships FFmpeg)
```

## Pipeline / state machine

`created → uploading_audio → transcribing → analyzing → segmenting → prompt_generation → video_generation → image_generation → waiting_assets → rendering → completed` (`failed` reachable from any active state; retry resets to a validated earlier stage). Defined in [`packages/core/src/state-machine`](packages/core/src/state-machine/project-state-machine.ts).

## Data model

11 tables — `users, settings, projects, transcripts, analyses, scenes, prompts, assets, generation_history, renders, jobs, activity_logs` — all with `uuid` PKs, `created_at/updated_at` (trigger-bumped), FKs, purpose-built indexes, and RLS scoped by project ownership. See [`packages/db/supabase/migrations`](packages/db/supabase/migrations/). Binaries live **only** in R2; tables hold R2 keys + metadata.

## Getting started (local)

```bash
cp .env.example .env          # fill in secrets
pnpm install
supabase start                # local Postgres + Auth
pnpm db:migrate               # apply packages/db/supabase/migrations
pnpm dev                      # turbo runs web + worker
```

## Delivery phases

| Phase | Scope | State |
|---|---|---|
| 1 | Architecture · folder structure · DB schema · infrastructure | ✅ done |
| 2 | Auth · storage (R2) · Redis · repositories · project CRUD | next |
| 3 | Upload · Deepgram transcription | |
| 4 | OpenAI analysis · scene segmentation · prompt generation | |
| 5 | Workers · 69Labs integration · polling · downloads | |
| 6 | FFmpeg rendering pipeline | |
| 7 | Dashboard · progress · preview | |
| 8 | Caching · retries · logging · optimization | |
```
