/**
 * Provision the ONLY accounts allowed to use yulia-video (private, invite-only).
 * Idempotent: creates each account or resets its password, and ensures the app
 * profile row. Uses the Supabase service-role key (admin API), so never ship
 * this to the browser.
 *
 *   pnpm --filter @yulia/web seed:users
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from the environment or
 * apps/web/.env.local). Keep these accounts + the app allowlist
 * (src/lib/auth/allowlist.ts) in sync.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env loader: only fills vars that aren't already set --------------
function loadEnvFile(fileUrl) {
  try {
    for (const line of readFileSync(fileUrl, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  } catch {
    /* file is optional */
  }
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  loadEnvFile(new URL('../.env.local', import.meta.url));
  loadEnvFile(new URL('../../../.env', import.meta.url));
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in the environment or apps/web/.env.local).',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The ONLY accounts allowed to use the tool. Rotate these after the first run.
const USERS = [
  { email: 'admin@classy.com', password: 'Yulia1!', role: 'admin', display_name: 'Admin' },
  { email: 'demo@example.com', password: 'demo123', role: 'member', display_name: 'Demo' },
];

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

for (const u of USERS) {
  let authUser = await findUserByEmail(u.email);
  if (authUser) {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: u.password,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`↻ updated ${u.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`+ created ${u.email}`);
  }

  // Ensure the app profile row (public.users). Service role bypasses RLS.
  const { error: pErr } = await admin
    .from('users')
    .upsert(
      { id: authUser.id, email: u.email, display_name: u.display_name, role: u.role },
      { onConflict: 'id' },
    );
  if (pErr) throw pErr;
}

console.log(`\n✓ Provisioned ${USERS.length} accounts. Only these can sign in.`);
