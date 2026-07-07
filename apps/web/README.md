# @yulia/web

Next.js (App Router) frontend + thin API. **Request handlers only validate, read state, and enqueue** — zero heavy work runs here (that's `@yulia/worker`).

Target internal structure (filled across Phases 2–7):

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (dashboard)/            # authed dashboard routes
│   │   │   ├── projects/          # list, [id] detail (transcript/scenes/prompts/assets/timeline/render)
│   │   │   └── settings/
│   │   ├── (auth)/                # sign-in / sign-up
│   │   └── api/
│   │       ├── health/           # Fly healthcheck
│   │       ├── projects/         # REST: POST/GET/PATCH/DELETE
│   │       ├── uploads/          # signed R2 upload URL issuance
│   │       └── projects/[id]/status/   # SSE realtime progress
│   ├── components/               # shadcn/ui + feature components
│   ├── hooks/                    # TanStack Query hooks
│   ├── actions/                  # server actions (mutations -> service layer)
│   ├── lib/                      # supabase clients, query client, api fetchers
│   └── config/                   # public runtime config
├── next.config.mjs               # output: 'standalone' for the Docker image
└── tailwind.config.ts
```

Design rules:
- **Server actions & route handlers** call the service layer (`@yulia/services`) and repositories (`@yulia/db`) — never external APIs inline.
- **Enqueue only**: any operation >100ms of work becomes a job on `@yulia/queue`.
- **Realtime**: project progress via SSE from the `jobs`/`projects` tables (Supabase Realtime as an alternative).
