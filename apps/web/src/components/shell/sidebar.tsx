'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Brand } from './brand';
import { SidebarNav } from './sidebar-nav';
import { Button } from '@/components/ui/primitives';

/** Persistent desktop sidebar + reused body for the mobile drawer. */
export function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <Brand />
      </div>

      <Link href="/create" onClick={() => onNavigate?.()}>
        <Button variant="accent" className="w-full justify-start" size="md">
          <Sparkles className="h-4 w-4" />
          New Film
        </Button>
      </Link>

      <div className="flex-1">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          Workspace
        </p>
        <SidebarNav onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line/8 bg-bg lg:block">
      <SidebarBody />
    </aside>
  );
}
