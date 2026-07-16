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

/**
 * Pull the masked account label the 69Labs client stamps into its error message
 * (`... /videos/generate [video key 2/3 (vk_uwUb…G1bR)] -> 403 ...`). Returns
 * null when absent — errors from before this was added, or non-69Labs failures.
 * The label is already masked at the source; this never sees a raw key.
 */
function extractKeyLabel(text: string): string | null {
  const m = /\[((?:video|image|media) key[^\]]*)\]/i.exec(text);
  return m ? m[1]! : null;
}

/**
 * Translate a raw failure (thrown error / provider string) into a clean,
 * user-facing message for the UI. The raw text still goes to logs and the
 * activity feed; this only shapes what an end user reads on a failed project.
 *
 * Ordered most-specific first. The 69Labs cases fold the technical
 * `[69labs] POST /images/generate -> 403 {"error":"Insufficient credits",...}`
 * dump into a plain-language explanation with the media type it applies to.
 */
export function userFacingFailureMessage(raw: string | undefined | null): string {
  const text = raw ?? '';
  const is69Labs = /\[69labs\]/i.test(text);
  const isImage = /\/images\//i.test(text);
  const isVideo = /\/videos\//i.test(text);
  const media = isImage ? 'image' : isVideo ? 'video' : 'media';
  // Which account failed, e.g. "video key 2/3 (vk_uwUb…G1bR)". The client stamps
  // this into the raw message (already masked); surfacing it tells the operator
  // exactly WHICH key to top up or fix instead of leaving them to guess.
  const key = extractKeyLabel(text);
  const onKey = key ? ` — on ${key}` : '';

  // Hard "out of credits" (monthly plan quota exhausted) — not a transient window.
  if (is69Labs && /insufficient credits/i.test(text)) {
    return `The ${media} generation service (69Labs) has no credits left${onKey}. Top up or upgrade that account's monthly ${media} quota, then retry.`;
  }
  // Time-window quota ("Hourly/Daily ... credit limit exceeded") — resets on a clock boundary.
  if (is69Labs && /(hourly|daily|weekly|monthly)\b.*\b(credit|limit)|credit limit exceeded/i.test(text)) {
    return `The ${media} generation service (69Labs) hit a temporary usage limit that resets shortly${onKey}. This will retry automatically — no action needed.`;
  }
  // Any other 69Labs 403/forbidden.
  if (is69Labs && /\b403\b|forbidden/i.test(text)) {
    return `The ${media} generation service (69Labs) rejected the request (access denied)${onKey}. Check that API key and its account status, then retry.`;
  }
  // Remaining 69Labs failures — surface the service, not the raw HTTP dump.
  if (is69Labs) {
    return `The ${media} generation service (69Labs) failed to complete a request. Retry resumes from the last safe checkpoint.`;
  }

  // Unknown failure: keep it generic rather than leaking an internal stack/dump.
  return raw && raw.trim().length > 0
    ? raw
    : 'A stage failed. Retry resumes from the last safe checkpoint — no double charges.';
}
