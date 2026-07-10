import { z } from 'zod';

/**
 * Centralized, fail-fast environment validation.
 *
 * Every process (web, worker, scripts) imports `env` from here. If a required
 * variable is missing or malformed, the process crashes at boot with a precise
 * message instead of exploding deep inside a render at runtime.
 *
 * NOTE: This module intentionally reads `process.env` eagerly on first import.
 * In Next.js, only import this from server-only code (route handlers, server
 * actions, workers) — never from a client component.
 */

const EnvSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Supabase / Postgres
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis (BullMQ + cache)
  REDIS_URL: z.string().min(1),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-2024-11-20'),
  // Per-scene prompt generation runs many small structured calls; a faster,
  // cheaper model keeps quality high while cutting this stage's latency + cost.
  // Falls back to OPENAI_MODEL if unset.
  OPENAI_PROMPT_MODEL: z.string().optional(),

  // Deepgram
  DEEPGRAM_API_KEY: z.string().min(1),
  DEEPGRAM_MODEL: z.string().default('nova-2'),

  // 69Labs
  SIXTYNINE_LABS_API_KEY: z.string().min(1),
  SIXTYNINE_LABS_BASE_URL: z.string().url().default('https://69labs.vip/api/v1'),
  // Optional model overrides. Unset -> the account's default model is used
  // (currently Veo 3.1 Lite for video). Some models (e.g. Veo) reject a
  // `duration` field; only enable SIXTYNINE_LABS_VIDEO_DURATION for a model that
  // supports it (e.g. grok-imagine-video).
  SIXTYNINE_LABS_VIDEO_MODEL: z.string().optional(),
  SIXTYNINE_LABS_IMAGE_MODEL: z.string().optional(),
  SIXTYNINE_LABS_VIDEO_DURATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Worker tuning
  //
  // Scene generation is I/O-bound: each job spends its life polling 69Labs, not
  // using CPU. So concurrency can run well above core count — the ceiling is
  // 69Labs' own per-account queue, not this machine. 12 lets a typical project's
  // scenes generate in one or two waves instead of 4-at-a-time.
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(12),
  // How long an idle BullMQ worker blocks waiting for a job before re-polling
  // Redis. Higher = far fewer Redis commands when queues are empty (each of the
  // 7 queues × N machines otherwise re-polls every few seconds 24/7), which
  // matters on metered Redis (Upstash per-command billing/caps). A waiting
  // worker is woken immediately when a job is enqueued, so this adds NO latency
  // to active work — it only throttles empty-queue polling. Default 30s.
  WORKER_DRAIN_DELAY_SEC: z.coerce.number().int().positive().default(30),
  GENERATION_POLL_TIMEOUT_SEC: z.coerce.number().int().positive().default(1200),
  // How often the generation stage polls 69Labs for a result. Lower = less dead
  // time between a scene finishing on 69Labs and the worker noticing (matters
  // now that a project has 40–60 scenes). Redis is unmetered (pay-as-you-go), so
  // the only real floor is 69Labs' status-GET rate limit; 2s stays well under it.
  // Raise only if 69Labs rate-limits status polls.
  GENERATION_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(2),
  // Max concurrent per-scene OpenAI prompt-generation calls. Bounded so a
  // many-scene project doesn't burst past OpenAI rate limits. Each call is
  // ~1000-1500 tokens; OpenAI Tier 1 caps gpt-4o at 30,000 TPM, so concurrency
  // 8 bursts 8,000-12,000 tokens in a couple seconds and reliably exhausts the
  // per-minute budget on any project with more than a handful of scenes (see
  // OpenAIService's in-process 429 retry, which absorbs occasional overflow —
  // this default keeps normal bursts under the cap in the first place). Raise
  // this only if the account is on a higher OpenAI usage tier.
  PROMPT_GENERATION_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // Max concurrent scene composites during the FFmpeg render. The render worker
  // is concurrency 1, but each composite doesn't saturate the VM's cores, so a
  // pool overlaps encodes. Keep at or below the VM core count to avoid CPU
  // oversubscription. Default matches the deployed performance-4x (4-core) VM;
  // override lower for local dev on fewer cores.
  RENDER_COMPOSITE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  // Hardware video encoder to use instead of software libx264, IF the worker
  // image + VM actually provide it (NVENC needs an NVIDIA GPU VM + an ffmpeg
  // build with NVENC support; QSV needs Intel Quick Sync). Off ('none') by
  // default because the current deployed VM (performance-8x) has no GPU and
  // the stock Debian ffmpeg package has no NVENC — enabling this without both
  // in place makes every render fail. Only set to 'nvenc'/'qsv' after
  // provisioning a GPU-backed Fly VM and switching the worker Dockerfile's
  // ffmpeg to a build with the matching encoder compiled in.
  RENDER_HW_ACCEL: z.enum(['none', 'nvenc', 'qsv']).default('none'),
  // Absolute path to the serif .ttf/.otf used for numbered title cards. Unset
  // -> the worker image's bundled Cinzel path. Set for local rendering on a
  // machine without that font installed.
  TITLE_CARD_FONT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Parse and cache the validated environment. Call sites should prefer the
 * exported `env` proxy; this function exists for tests that inject overrides.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Lazily-validated singleton. First property access triggers validation so that
 * importing this module in a client bundle (which shouldn't happen) does not
 * throw at import time — only on actual use.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (!cached) cached = loadEnv();
    return cached[prop as keyof Env];
  },
});

export const isProd = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';
