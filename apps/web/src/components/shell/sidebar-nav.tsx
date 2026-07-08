'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { NAV_ITEMS } from './nav-items';
import { cn } from '@/lib/utils';

export function SidebarNav({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          !item.soon && (pathname === item.href || pathname.startsWith(item.href + '/'));
        const Icon = item.icon;

        if (item.soon) {
          return (
            <div
              key={item.label}
              className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-subtle/70"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                Soon
              </span>
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => onNavigate?.()}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-lg bg-accent/[0.08] ring-1 ring-inset ring-accent/15"
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <Icon className={cn('relative z-10 h-4 w-4 shrink-0', active && 'text-accent')} />
            <span className="relative z-10 flex-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
