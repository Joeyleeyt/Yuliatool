'use client';

import { useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { Brand } from './brand';
import { CommandPalette } from './command-palette';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Kbd } from '@/components/ui/primitives';

export function Topbar({
  userEmail,
  onOpenNav,
}: {
  userEmail?: string | undefined;
  onOpenNav: () => void;
}) {
  const initial = (userEmail?.[0] ?? 'u').toUpperCase();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line/8 glass">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
        {/* Mobile: hamburger + brand */}
        <button
          onClick={onOpenNav}
          className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="lg:hidden">
          <Brand />
        </div>

        {/* Desktop: command palette trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-line/10 bg-surface-1/60 px-3 py-1.5 text-sm text-fg-subtle transition-colors hover:border-line/20 hover:text-fg-muted lg:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search projects</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-fg-subtle sm:inline">{userEmail}</span>
          <SignOutButton />
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-accent-soft to-accent text-xs font-semibold text-white">
            {initial}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
