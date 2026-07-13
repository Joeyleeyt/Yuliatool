import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StudioShell } from '@/components/shell/studio-shell';
import { isEmailAllowed } from '@/lib/auth/allowlist';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Private tool: no session, or an account outside the allowlist → back to login.
  if (!user || !isEmailAllowed(user.email)) redirect('/login?denied=1');

  return <StudioShell userEmail={user.email}>{children}</StudioShell>;
}
