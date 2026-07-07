'use client';

import { PROJECT_STATUS_META } from '@yulia/core/enums';
import { CheckCircle2, AlertCircle, Loader2, CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Kind = 'idle' | 'active' | 'done' | 'error';

function classify(status: string): { kind: Kind; tone: 'neutral' | 'violet' | 'emerald' | 'red' } {
  if (status === 'completed') return { kind: 'done', tone: 'emerald' };
  if (status === 'failed') return { kind: 'error', tone: 'red' };
  const meta = PROJECT_STATUS_META[status as keyof typeof PROJECT_STATUS_META];
  if (meta && meta.order > 0) return { kind: 'active', tone: 'violet' };
  return { kind: 'idle', tone: 'neutral' };
}

/** Small live dot that pulses while a stage is running. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const { kind } = classify(status);
  const color = {
    idle: 'bg-fg-subtle',
    active: 'bg-warning',
    done: 'bg-success',
    error: 'bg-danger',
  }[kind];
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      {kind === 'active' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/70" />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const meta = PROJECT_STATUS_META[status as keyof typeof PROJECT_STATUS_META];
  const { kind, tone } = classify(status);
  const Icon = { idle: CircleDashed, active: Loader2, done: CheckCircle2, error: AlertCircle }[kind];
  return (
    <Badge tone={tone}>
      <Icon className={cn('h-3 w-3', kind === 'active' && 'animate-spin')} />
      {meta?.label ?? status}
    </Badge>
  );
}
