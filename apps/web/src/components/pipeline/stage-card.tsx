'use client';

import { motion } from 'framer-motion';
import { Check, Loader2, Clock, AlertCircle } from 'lucide-react';
import type { PipelineStage } from './stages';
import type { NodeState } from './pipeline-node';
import { cn } from '@/lib/utils';

const medallion: Record<NodeState, string> = {
  done: 'bg-success/12 text-success ring-success/30',
  active: 'bg-accent/14 text-accent ring-accent/40',
  pending: 'bg-surface-2 text-fg-subtle ring-line/10',
  error: 'bg-danger/12 text-danger ring-danger/40',
};
const stateIcon: Record<NodeState, typeof Check> = {
  done: Check,
  active: Loader2,
  pending: Clock,
  error: AlertCircle,
};

export function StageCard({
  stage,
  state,
  pct,
  metric,
  eta,
}: {
  stage: PipelineStage;
  state: NodeState;
  /** 0–100, or null for an indeterminate (unknown-duration) active stage. */
  pct: number | null;
  metric?: string | undefined;
  eta?: string | undefined;
}) {
  const Icon = stateIcon[state];
  const shownPct = state === 'done' ? 100 : state === 'pending' ? 0 : pct;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col rounded-2xl border p-4 transition-colors',
        state === 'active' && 'border-accent/30 bg-accent/[0.05] shadow-[0_10px_30px_-14px_rgb(var(--accent)/0.5)]',
        state === 'done' && 'border-success/20 bg-success/[0.03]',
        state === 'pending' && 'border-line/8 bg-surface-1/50',
        state === 'error' && 'border-danger/30 bg-danger/[0.04]',
      )}
    >
      {/* pulsing border while active */}
      {state === 'active' && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-accent/40"
          animate={{ opacity: [0.25, 0.7, 0.25] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative flex items-center justify-between">
        <span
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset',
            medallion[state],
          )}
        >
          <Icon className={cn('h-4 w-4', state === 'active' && 'animate-spin')} />
        </span>
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            state === 'done' ? 'text-success' : state === 'active' ? 'text-accent' : 'text-fg-subtle',
          )}
        >
          {shownPct == null ? '···' : `${Math.round(shownPct)}%`}
        </span>
      </div>

      <p className="relative mt-3 text-sm font-medium tracking-tight text-fg">{stage.label}</p>
      <p
        className={cn(
          'relative mt-0.5 truncate text-[11px]',
          state === 'active' ? 'text-fg-muted' : 'text-fg-subtle',
        )}
        title={metric ?? stage.engine}
      >
        {metric ?? stage.engine}
      </p>

      {/* progress bar */}
      <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        {shownPct == null ? (
          <div className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent animate-shimmer bg-[length:200%_100%]" />
        ) : (
          <motion.div
            className={cn(
              'h-full rounded-full',
              state === 'done'
                ? 'bg-gradient-to-r from-success to-emerald-400'
                : state === 'error'
                  ? 'bg-gradient-to-r from-danger to-red-400'
                  : 'bg-gradient-to-r from-accent-soft to-accent',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(shownPct > 0 ? 4 : 0, shownPct)}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>

      {eta && state === 'active' && (
        <p className="relative mt-2 font-mono text-[10px] text-fg-subtle">{eta}</p>
      )}
    </div>
  );
}
