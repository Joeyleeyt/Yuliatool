import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/config/public-env';

/**
 * Supabase client for Server Components / Route Handlers. Reads + refreshes the
 * auth session from the request cookies. Uses the anon key + the user's JWT, so
 * RLS applies to any direct Supabase queries (our writes go through the domain
 * layer on a service-role Postgres connection instead).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set({ name, value, ...options });
          }
        } catch {
          // `setAll` called from a Server Component — safe to ignore; the
          // middleware refreshes the session cookie on the next request.
        }
      },
    },
  });
}
