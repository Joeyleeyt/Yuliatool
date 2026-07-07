/**
 * Browser-safe public config. Only `NEXT_PUBLIC_*` vars — never import the
 * server env (`@yulia/core/env`) here; this module is used in the Edge
 * middleware and the client bundle.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const publicEnv = {
  supabaseUrl,
  supabaseAnonKey,
} as const;
