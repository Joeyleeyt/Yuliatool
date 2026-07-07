import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/config/public-env';

/** Supabase client for Client Components (browser). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
