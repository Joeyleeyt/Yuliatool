import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { AppError, createLogger } from '@yulia/core';
import type { AppContext } from '@yulia/domain';
import { getAppContext, requireUser, type AuthedUser } from './context';
import { jsonError } from './http';

export interface RouteHandlerArgs<P> {
  req: NextRequest;
  ctx: AppContext;
  user: AuthedUser;
  params: P;
}

export interface RateLimitConfig {
  /** Stable suffix identifying the operation, e.g. 'projects:create'. */
  key: string;
  limit: number;
  windowSec: number;
}

export interface RouteOptions {
  auth?: boolean; // default true
  rateLimit?: RateLimitConfig;
}

/** Next 15 passes `{ params: Promise<...> }` as the 2nd arg to route handlers. */
type NextRouteContext<P> = { params: Promise<P> };

/**
 * Combinator that standardizes every API route: resolves the domain context,
 * enforces auth, applies per-user rate limiting, awaits dynamic params, and
 * funnels all thrown values through a single typed-error → HTTP mapper.
 */
export function route<P = Record<string, string>>(
  handler: (args: RouteHandlerArgs<P>) => Promise<Response>,
  options: RouteOptions = {},
): (req: NextRequest, context: NextRouteContext<P>) => Promise<Response> {
  const requireAuth = options.auth ?? true;

  return async (req, context) => {
    // Correlation id: honor an inbound header or mint one; echo on every response.
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const log = createLogger({ requestId, method: req.method, path: req.nextUrl.pathname });
    const startedAt = Date.now();

    const finish = (res: Response): Response => {
      res.headers.set('x-request-id', requestId);
      log.info({ status: res.status, ms: Date.now() - startedAt }, 'request');
      return res;
    };

    try {
      const ctx = getAppContext();
      const params = ((await context?.params) ?? {}) as P;

      if (!requireAuth) {
        return finish(await handler({ req, ctx, user: { id: '', email: '' }, params }));
      }

      const user = await requireUser(ctx);

      if (options.rateLimit) {
        const { key, limit, windowSec } = options.rateLimit;
        const result = await ctx.rateLimiter.check(`user:${user.id}:${key}`, limit, windowSec);
        if (!result.allowed) {
          throw new AppError({
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            context: { retryAfterSec: result.resetSec },
          });
        }
      }

      return finish(await handler({ req, ctx, user, params }));
    } catch (err) {
      return finish(jsonError(err));
    }
  };
}
