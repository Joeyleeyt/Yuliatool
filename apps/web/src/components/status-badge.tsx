'use client';

import { PROJECT_STATUS_META } from '@yulia/core/enums';
import { CheckCircle2, AlertCircle, Loader2, CircleDashed, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Kind = 'idle' | 'queued' | 'active' | 'done' | 'error';
type Tone = 'neutral' | 'blue' | 'violet' | 'amber' | 'indigo' | 'emerald' | 'red';

/**
 * Production-status color mapping: Draft=gray, Uploading=blue, AI Analysis=purple,
 * Generating=orange, Rendering=indigo, Ready=green, Failed=red — matches the
 * brief's palette while staying driven off the real `ProjectStatus` values.
 */
function classify(status: string): { kind: Kind; tone: Tone } {
  if (status === 'completed') return { kind: 'done', tone: 'emerald' };
  if (status === 'failed') return { kind: 'error', tone: 'red' };
  if (status === 'queued') return { kind: 'queued', tone: 'amber' };
  if (status === 'created') return { kind: 'idle', tone: 'neutral' };
  if (status === 'uploading_audio') return { kind: 'active', tone: 'blue' };
  if (status === 'transcribing' || status === 'analyzing') return { kind: 'active', tone: 'violet' };
  if (status === 'rendering') return { kind: 'active', tone: 'indigo' };
  const meta = PROJECT_STATUS_META[status as keyof typeof PROJECT_STATUS_META];
  // segmenting / prompt_generation / video_generation / image_generation / waiting_assets
  if (meta && meta.order > 0) return { kind: 'active', tone: 'amber' };
  return { kind: 'idle', tone: 'neutral' };
}

/** Small live dot that pulses while a stage is running. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const { kind } = classify(status);
  const color = {
    idle: 'bg-fg-subtle',
    queued: 'bg-warning',
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
  const Icon = {
    idle: CircleDashed,
    queued: Clock,
    active: Loader2,
    done: CheckCircle2,
    error: AlertCircle,
  }[kind];
  return (
    <Badge tone={tone}>
      <Icon className={cn('h-3 w-3', kind === 'active' && 'animate-spin')} />
      {meta?.label ?? status}
    </Badge>
  );
}
