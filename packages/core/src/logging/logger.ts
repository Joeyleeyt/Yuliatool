import { pino, type Logger } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured logging via pino. JSON in production (ingestible by Fly/Grafana),
 * pretty in dev. Always attach a correlation context (projectId, jobId) via
 * `logger.child({...})` at the worker/request boundary so lines are traceable.
 */
const base: Logger = pino({
  level: env.LOG_LEVEL,
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
