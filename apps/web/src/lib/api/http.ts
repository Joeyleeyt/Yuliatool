import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, logger } from '@yulia/core';

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Map any thrown value to a consistent JSON error response. */
export function jsonError(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Request validation failed',
          details: err.issues,
        },
      },
      { status: 400 },
    );
  }

  if (err instanceof AppError) {
    // 5xx are unexpected; log with stack. 4xx are client errors; keep quiet.
    if (err.httpStatus >= 500) logger.error({ err }, 'api error');
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.context ? { details: err.context } : {}) } },
      { status: err.httpStatus },
    );
  }

  logger.error({ err }, 'unhandled api error');
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}
