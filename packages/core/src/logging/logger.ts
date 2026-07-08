import { pino, type Logger } from 'pino';

/**
 * Structured logging via pino. JSON in production (ingestible by Fly/Grafana),
 * pretty in dev. Always attach a correlation context (projectId, jobId) via
 * `logger.child({...})` at the worker/request boundary so lines are traceable.
 *
 * NOTE: the level is read straight from `process.env` (with a safe fallback)
 * rather than the validated `env` proxy on purpose. This module is imported
 * transitively by every route/module; touching the `env` proxy here would force
 * full env validation at *import* time, which crashes `next build`'s page-data
 * collection whenever a required secret is absent from the build environment.
 * Logging bootstrap must never depend on the full runtime config being present.
 */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
const rawLevel = process.env.LOG_LEVEL;
const level = (LOG_LEVELS as readonly string[]).includes(rawLevel ?? '') ? rawLevel! : 'info';

const base: Logger = pino({
  level,
  base: { service: 'yulia-video' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.apiKey',
      '*.secret',
      'OPENAI_API_KEY',
      'DEEPGRAM_API_KEY',
      'SIXTYNINE_LABS_API_KEY',
      'R2_SECRET_ACCESS_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    censor: '[redacted]',
  },
});

export const logger = base;

export function createLogger(bindings: Record<string, unknown>): Logger {
  return base.child(bindings);
}

export type { Logger };
