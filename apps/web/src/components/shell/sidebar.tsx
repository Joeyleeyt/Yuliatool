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
          Create Video
        </Button>
      </Link>

      <div className="flex-1">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          Workspace
        </p>
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <UsagePill />
    </div>
  );
}

/** A calm at-a-glance credits meter pinned to the sidebar foot. */
function UsagePill() {
  const used = 3;
  const total = 10;
  const pct = Math.round((used / total) * 100);
  return (
    <div className="rounded-xl border border-line/8 bg-surface-1 p-3.5 ring-hairline">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-fg-muted">Render credits</span>
        <span className="font-mono text-fg-subtle">
          {used}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-soft to-accent"
          style={{ width: `${pct}%` }}
        />
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
