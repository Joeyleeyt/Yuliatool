'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Film, Search, CornerDownLeft } from 'lucide-react';
import { useProjects } from '@/lib/query/hooks';
import { StatusBadge } from '@/components/status-badge';
import { easePremium } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

type Item =
  | { id: string; label: string; kind: 'action'; hint: string; icon: typeof Film; onSelect: () => void }
  | { id: string; label: string; kind: 'project'; status: string; icon: typeof Film; onSelect: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data } = useProjects();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const create: Item = {
      id: 'create',
      label: 'Create Video',
      kind: 'action',
      hint: 'Start a new production',
      icon: Sparkles,
      onSelect: () => router.push('/create'),
    };
    const projects = (data?.items ?? []).map(
      (p): Item => ({
        id: p.id,
        label: p.title || 'Untitled production',
        kind: 'project',
        status: p.status,
        icon: Film,
        onSelect: () => router.push(`/projects/${p.id}`),
      }),
    );
    const all = [create, ...projects];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => i.label.toLowerCase().includes(q));
  }, [data, query, router]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[active];
        if (item) {
          item.onSelect();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 top-24 z-50 mx-auto w-full max-w-lg px-4"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: easePremium }}
          >
            <div className="overflow-hidden rounded-2xl border border-line/10 bg-surface-1 shadow-lg ring-hairline">
              <div className="flex items-center gap-2.5 border-b border-line/8 px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Jump to a project, or create one…"
                  className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>

              <div className="max-h-80 overflow-y-auto p-1.5">
                {items.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-fg-subtle">No matches.</p>
                ) : (
                  items.map((item, i) => {
                    const Icon = item.icon;
                    const isActive = i === active;
                    return (
                      <button
                        key={item.id}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => {
                          item.onSelect();
                          onClose();
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          isActive ? 'bg-accent/8' : 'hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
                            isActive ? 'bg-accent/12 text-accent ring-accent/25' : 'bg-surface-2 text-fg-subtle ring-line/10',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{item.label}</span>
                        </span>
                        {item.kind === 'action' ? (
                          <span className="shrink-0 text-xs text-fg-subtle">{item.hint}</span>
                        ) : (
                          <StatusBadge status={item.status} />
                        )}
                        {isActive && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
