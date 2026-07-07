# @yulia/domain

The **application service layer** — the single home for business rules. Orchestrates repositories (`@yulia/db`), infra providers (`@yulia/services`), and the state machine (`@yulia/core`).

- API route handlers and (later) worker processors call these services; they never touch repositories or providers directly.
- `AppContext` is a lightweight DI container: `createAppContext()` wires the default singletons; tests inject fakes.
- All state transitions go through `ProjectService.transition()`, which validates against `ProjectStateMachine` and writes an activity-log entry.

Services (grows each phase):
| Service | Responsibility | Phase |
|---|---|---|
| `ProjectService` | project CRUD, ownership, status transitions, R2 cleanup | 2 |
| `UploadService` | signed voiceover upload, finalize → advance pipeline | 2 (enqueue in 3) |
| `TranscriptionService` | Deepgram orchestration | 3 |
| `AnalysisService` / `SegmentationService` / `PromptService` | OpenAI stages | 4 |
| `GenerationService` (video/image) | 69Labs submit/poll/download orchestration | 5 |
| `RenderService` | FFmpeg pipeline orchestration | 6 |
