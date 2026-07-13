import { AppError } from '@yulia/core';
import { createAppContext, type AppContext } from '@yulia/domain';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/auth/allowlist';

/** Process-wide domain context (repos + providers), lazily constructed. */
let appContext: AppContext | null = null;

export function getAppContext(): AppContext {
  if (!appContext) appContext = createAppContext();
  return appContext;
}

export interface AuthedUser {
  id: string;
  email: string;
}

/**
 * Resolve the authenticated user from the Supabase session or throw 401.
 * Ensures an app profile row exists (idempotent, cached to avoid a write per
 * request).
 */
export async function requireUser(ctx: AppContext): Promise<AuthedUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const email = user.email ?? '';
  // Private tool: only the allowlisted accounts may use the API.
  if (!isEmailAllowed(email)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'This account is not permitted to use yulia-video.' });
  }
  const ensuredKey = `profile:ensured:${user.id}`;
  const alreadyEnsured = await ctx.cache.get<boolean>(ensuredKey);
  if (!alreadyEnsured) {
    await ctx.repos.users.upsertProfile({ id: user.id, email });
    await ctx.cache.set(ensuredKey, true, 3600);
  }

  return { id: user.id, email };
}
