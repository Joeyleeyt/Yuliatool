'use client';

import { motion } from 'framer-motion';
import type { ActivityLogRow } from '@/lib/api/types';
import { cn } from '@/lib/utils';

function toneFor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('fail') || t.includes('error')) return 'text-danger';
  if (t.includes('complete') || t.includes('done') || t.includes('stored') || t.includes('ready'))
    return 'text-success';
  if (t.includes('start') || t.includes('generat') || t.includes('queue') || t.includes('render'))
    return 'text-accent-soft';
  return 'text-fg-muted';
}

function ts(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

export function ActivityLog({ items }: { items: ActivityLogRow[] }) {
  const ordered = [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-[#0b0b0d] ring-hairline">
      {/* terminal chrome */}
      <div className="flex items-center gap-2 border-b border-line/8 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-2 font-mono text-xs text-fg-subtle">pipeline · activity</span>
        <span className="ml-auto font-mono text-[11px] text-fg-subtle">{ordered.length} events</span>
      </div>

      {/* stream */}
      <div className="max-h-[420px] overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
        {ordered.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.25 }}
            className="flex gap-3 py-0.5"
          >
            <span className="shrink-0 text-fg-subtle">{ts(a.created_at)}</span>
            <span className={cn('shrink-0 font-medium', toneFor(a.type))}>
              {a.type.replace(/_/g, ' ')}
            </span>
            {a.message && <span className="text-fg-muted">{a.message}</span>}
          </motion.div>
        ))}
        <div className="flex gap-2 pt-1 text-fg-subtle">
          <span className="animate-pulse">▍</span>
        </div>
      </div>
    </div>
  );
}
