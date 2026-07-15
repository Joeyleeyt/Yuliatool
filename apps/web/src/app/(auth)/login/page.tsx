'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isEmailAllowed } from '@/lib/auth/allowlist';
import { Brand } from '@/components/shell/brand';
import { Button, Card, CardContent, Input, Label, Spinner } from '@/components/ui/primitives';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Surface a message when the guard bounced a non-permitted session here.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('denied')) {
      setError('This account is not permitted to use Classy Woman Video.');
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // Belt-and-suspenders: even a valid account outside the allowlist is rejected.
    if (!isEmailAllowed(email)) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('This account is not permitted to use Classy Woman Video.');
      return;
    }

    router.push('/projects');
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-editorial-glow opacity-70" />
      <Card className="relative w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Brand href="/" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-fg">Sign in</h1>
              <p className="mt-1 text-sm text-fg-muted">Private studio — invite only.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button variant="accent" type="submit" disabled={loading} className="mt-1 w-full">
              {loading ? <Spinner /> : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
