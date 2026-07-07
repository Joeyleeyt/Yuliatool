'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import type { PipelineStage } from './stages';
import { cn } from '@/lib/utils';

export type NodeState = 'done' | 'active' | 'pending' | 'error';

const medallion: Record<NodeState, string> = {
  done: 'bg-success/12 text-success ring-success/30',
  active: 'bg-accent/14 text-accent-soft ring-accent/40',
  pending: 'bg-surface-2 text-fg-subtle ring-line/10',
  error: 'bg-danger/12 text-danger ring-danger/40',
};

export function PipelineNode({
  stage,
  state,
  isLast,
  detail,
  right,
  onClick,
}: {
  stage: PipelineStage;
  state: NodeState;
  isLast?: boolean;
  detail?: string | undefined;
  right?: ReactNode;
  onClick?: (() => void) | undefined;
}) {
  const Icon = stage.icon;

  return (
    <div className="relative flex gap-4">
      {/* Rail + medallion */}
      <div className="flex flex-col items-center">
        <motion.div
          initial={false}
          animate={state === 'active' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 1.8, repeat: state === 'active' ? Infinity : 0 }}
          className={cn(
            'relative z-10 grid h-11 w-11 place-items-center rounded-xl ring-1 ring-inset transition-colors',
            medallion[state],
          )}
        >
          {state === 'done' ? (
            <Check className="h-5 w-5" />
          ) : state === 'active' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : state === 'error' ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
          {state === 'active' && (
            <span className="absolute inset-0 -z-10 animate-ping rounded-xl bg-accent/25" />
          )}
        </motion.div>
        {!isLast && (
          <div className="relative w-px flex-1 bg-line/10">
            {state === 'done' && <div className="absolute inset-0 bg-success/40" />}
          </div>
        )}
      </div>

      {/* Body */}
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          'mb-4 flex-1 rounded-xl border p-4 text-left transition-colors',
          state === 'active' ? 'border-accent/25 bg-surface-1' : 'border-line/8 bg-surface-1/60',
          onClick && 'hover:border-line/20',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{stage.label}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
              {stage.engine}
            </p>
          </div>
          {right}
        </div>
        <p
          className={cn(
            'mt-2 text-xs leading-relaxed',
            state === 'pending' ? 'text-fg-subtle' : 'text-fg-muted',
          )}
        >
          {detail ?? stage.blurb}
        </p>
      </button>
    </div>
  );
}
