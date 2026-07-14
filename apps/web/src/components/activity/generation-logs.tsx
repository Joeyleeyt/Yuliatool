'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { useActivity } from '@/lib/query/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Level = 'info' | 'ok' | 'error';

function levelFor(type: string): Level {
  const t = type.toLowerCase();
  if (t.includes('fail') || t.includes('error')) return 'error';
  if (t.includes('complete') || t.includes('done') || t.includes('stored') || t.includes('ready') || t.includes('success'))
    return 'ok';
  return 'info';
}

const barClass: Record<Level, string> = {
  info: 'bg-accent/50',
  ok: 'bg-success/60',
  error: 'bg-danger/60',
};
const textClass: Record<Level, string> = {
  info: 'text-fg-muted',
  ok: 'text-success',
  error: 'text-danger',
};

function humanize(type: string): string {
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function stamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function GenerationLogs({ id }: { id: string }) {
  const { data, isLoading } = useActivity(id);
  if (isLoading) return <Skeleton className="h-80 w-full rounded-2xl" />;

  const items = data?.activity ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Terminal}
        title="No logs yet"
        description="Once the pipeline starts, every step the studio takes streams here in real time."
      />
    );
  }

  // Oldest first — a log tails downward like a real build/deploy stream.
  const ordered = [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline">
      <div className="flex items-center gap-2 border-b border-line/8 px-5 py-3.5">
        <Terminal className="h-3.5 w-3.5 text-fg-subtle" />
        <span className="text-sm font-medium tracking-tight text-fg">Generation logs</span>
        <span className="ml-auto font-mono text-[11px] text-fg-subtle">{ordered.length} lines</span>
      </div>

      <div className="max-h-[520px] overflow-y-auto bg-surface-2/30 p-4 font-mono text-[12.5px] leading-relaxed">
        <AnimatePresence initial={false}>
          {ordered.map((a, i) => {
            const level = levelFor(a.type);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.25 }}
                className="group flex gap-3 py-0.5"
              >
                <span className={cn('mt-1 h-3 w-0.5 shrink-0 rounded-full', barClass[level])} aria-hidden />
                <span className="shrink-0 text-fg-subtle">{stamp(a.created_at)}</span>
                <span className="text-fg-subtle">·</span>
                <span className={cn('min-w-0 flex-1 truncate', textClass[level])}>
                  {a.message || humanize(a.type)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {/* blinking cursor to sell the "live" feel when the feed is still open */}
        <div className="mt-1 flex items-center gap-2 pl-3.5">
          <span className="h-3.5 w-1.5 animate-pulse bg-accent/40" aria-hidden />
        </div>
      </div>
    </div>
  );
}
