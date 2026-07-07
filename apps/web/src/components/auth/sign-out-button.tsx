'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/primitives';

export function SignOutButton() {
  const router = useRouter();
  const onSignOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };
  return (
    <Button variant="ghost" size="sm" onClick={() => void onSignOut()}>
      Sign out
    </Button>
  );
}
