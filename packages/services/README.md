# @yulia/services

External-I/O abstraction layer. **Nothing else in the codebase calls a third-party API directly.**

Each provider sits behind a narrow interface so the worker orchestration is provider-agnostic, mockable, and retry-aware.

| Module | Interface | Phase |
|---|---|---|
| `storage/R2StorageService` | `putObject`, `getObject`, `signedUpload`, `signedDownload`, `deletePrefix` | 2 |
| `cache/RedisCache` | `get`, `set`, `withLock`, `remember` | 2 |
| `transcription/DeepgramService` | `transcribe(audioUrl) -> Transcript` | 3 |
| `ai/OpenAIService` | `analyze`, `segment`, `generatePrompts` (structured outputs, schema-validated) | 4 |
| `generation/VideoGenerationService` | `submit`, `poll`, `download` | 5 |
| `generation/ImageGenerationService` | `submit`, `poll`, `download` | 5 |

Shared contract for generation providers (defined here in Phase 5):

```ts
interface GenerationService {
  submit(input: GenerationRequest): Promise<{ externalId: string }>;
  poll(externalId: string): Promise<GenerationResult>;   // pending | done | failed
  download(result: GenerationResult): Promise<Readable>; // stream -> R2
}
```
