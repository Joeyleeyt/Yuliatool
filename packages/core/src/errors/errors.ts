/**
 * Typed error hierarchy shared across layers. Repositories, services, and
 * workers throw these; the API layer maps them to HTTP status codes and the
 * worker layer decides retry-vs-dead-letter from `retryable`.
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'EXTERNAL_SERVICE'
  | 'STORAGE'
  | 'RENDER'
  | 'STATE_TRANSITION'
  | 'INTERNAL';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  httpStatus?: number;
  retryable?: boolean;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly context: Record<string, unknown> | undefined;

  constructor(opts: AppErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = opts.code;
    this.httpStatus = opts.httpStatus ?? defaultHttpStatus(opts.code);
    this.retryable = opts.retryable ?? false;
    this.context = opts.context;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

function defaultHttpStatus(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'STATE_TRANSITION':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'EXTERNAL_SERVICE':
    case 'STORAGE':
    case 'RENDER':
    case 'INTERNAL':
    default:
      return 500;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super({ code: 'NOT_FOUND', message: `${entity}${id ? ` (${id})` : ''} not found` });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ code: 'VALIDATION', message, ...(context ? { context } : {}) });
  }
}

/** Options for the convenience subclasses (code/message are fixed by the class). */
type SubclassOptions = Omit<AppErrorOptions, 'code' | 'message'>;

/** Merge fixed fields with caller overrides without violating exactOptionalPropertyTypes. */
function mergeOptions(
  code: ErrorCode,
  message: string,
  defaults: Partial<SubclassOptions>,
  overrides?: SubclassOptions,
): AppErrorOptions {
  const opts: AppErrorOptions = { code, message };
  const retryable = overrides?.retryable ?? defaults.retryable;
  if (retryable !== undefined) opts.retryable = retryable;
  const httpStatus = overrides?.httpStatus ?? defaults.httpStatus;
  if (httpStatus !== undefined) opts.httpStatus = httpStatus;
  if (overrides?.cause !== undefined) opts.cause = overrides.cause;
  if (overrides?.context !== undefined) opts.context = overrides.context;
  return opts;
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, opts?: SubclassOptions) {
    super(mergeOptions('EXTERNAL_SERVICE', `[${service}] ${message}`, { retryable: true }, opts));
  }
}

export class StorageError extends AppError {
  constructor(message: string, opts?: SubclassOptions) {
    super(mergeOptions('STORAGE', message, { retryable: true }, opts));
  }
}

export class RenderError extends AppError {
  constructor(message: string, opts?: SubclassOptions) {
    super(mergeOptions('RENDER', message, {}, opts));
  }
}

/** Narrow unknown thrown values to a retryable decision for worker backoff. */
export function isRetryable(err: unknown): boolean {
  return err instanceof AppError ? err.retryable : false;
}
