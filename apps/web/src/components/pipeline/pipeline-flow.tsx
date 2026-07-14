'use client';

import { RotateCw, AlertCircle } from 'lucide-react';
import { useProjectStatus, useRetryProject } from '@/lib/query/hooks';
import { PIPELINE_STAGES, stageIndexForStatus, type NodeState } from './stages';
import { StageCard } from './stage-card';
import { ProgressIndicator } from './progress-indicator';
import { GenerationTimer } from './generation-timer';
import { Badge, Button } from '@/components/ui/primitives';
import { PROJECT_STATUS_META } from '@yulia/core/enums';

/** Rough time-remaining from elapsed vs overall progress. Estimate only. */
function etaLabel(startedAt: string, progress: number): string | undefined {
  if (progress <= 2 || progress >= 99) return undefined;
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return undefined;
  const elapsed = (Date.now() - startMs) / 1000;
  const remaining = (elapsed * (100 - progress)) / progress;
  if (!Number.isFinite(remaining) || remaining <= 0) return undefined;
  const m = Math.round(remaining / 60);
  if (m >= 60) return `ETA ~${Math.floor(m / 60)}h ${m % 60}m`;
  if (m >= 1) return `ETA ~${m}m left`;
  return `ETA ~${Math.round(remaining)}s left`;
}

export function PipelineFlow({ id }: { id: string }) {
  const { data } = useProjectStatus(id);
  const retry = useRetryProject(id);

  if (!data) return null;

  const running = !['completed', 'failed', 'created', 'queued'].includes(data.status);
  const failed = data.status === 'failed';
  const completed = data.status === 'completed';
  const queued = data.status === 'queued';
  const cs = stageIndexForStatus(data.status);
  const meta = PROJECT_STATUS_META[data.status as keyof typeof PROJECT_STATUS_META];
  const eta = running ? etaLabel(data.startedAt, data.progress) : undefined;

  const nodeState = (i: number): NodeState => {
    if (completed) return 'done';
    if (failed) return i < cs ? 'done' : i === cs ? 'error' : 'pending';
    if (i < cs) return 'done';
    if (i === cs) return 'active';
    return 'pending';
  };

  // Live percentage for the active stage where we have real signal; else null (indeterminate).
  const stagePct = (i: number): number | null => {
    const st = nodeState(i);
    if (st === 'done') return 100;
    if (st === 'pending' || st === 'error') return st === 'error' ? 0 : 0;
    const key = PIPELINE_STAGES[i]!.key;
    if ((key === 'video' || key === 'image') && data.totalScenes > 0) {
      return Math.min(100, (data.completedScenes / data.totalScenes) * 100);
    }
    return null; // transcript / analysis / planning / render: unknown granularity
  };

  const stageMetric = (i: number): string | undefined => {
    const st = nodeState(i);
    const key = PIPELINE_STAGES[i]!.key;
    if (st === 'done') return 'Complete';
    if (st === 'pending') return 'Waiting';
    if (st === 'error') return 'Failed';
    // active
    switch (key) {
      case 'audio':
        return 'Narration uploaded';
      case 'transcript':
        return 'Transcribing…';
      case 'analysis':
        return 'Reading the story…';
      case 'planning':
        return data.totalScenes > 0 ? `${data.totalScenes} scenes planned` : 'Segmenting…';
      case 'video':
        return `${data.completedScenes} / ${data.totalScenes} clips`;
      case 'image':
        return `${data.completedScenes} / ${data.totalScenes} stills`;
      case 'render':
        return 'Encoding & muxing…';
      default:
        return undefined;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/8 bg-surface-1 p-6 shadow-soft ring-hairline">
      {running && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-editorial-glow opacity-70" />
      )}

      {/* Header */}
      <div className="relative mb-6 flex items-center gap-5">
        <ProgressIndicator
          value={completed ? 100 : queued ? 0 : data.progress}
          tone={failed ? 'danger' : completed ? 'success' : 'accent'}
          label={queued ? 'queued' : 'done'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium tracking-tight text-fg">
              {completed
                ? 'Production complete'
                : failed
                  ? 'Production halted'
                  : queued
                    ? 'Queued'
                    : 'Studio at work'}
            </h3>
            {running && (
              <Badge tone="violet">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-soft/70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-soft" />
                </span>
                Live
              </Badge>
            )}
            {queued && <Badge tone="amber">Waiting</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {queued
              ? data.queuePosition && data.queuePosition > 1
                ? `Position ${data.queuePosition} in queue — starts when the current productions finish`
                : 'Next up — starts as soon as the current production finishes'
              : (meta?.label ?? data.status)}
            {!queued && data.totalScenes > 0 && ` · ${data.completedScenes}/${data.totalScenes} scenes ready`}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <GenerationTimer
              startedAt={data.startedAt}
              completedAt={data.completedAt}
              durationSec={data.durationSec}
              running={running}
            />
            {eta && <span className="font-mono text-xs text-fg-subtle">· {eta}</span>}
          </div>
        </div>
      </div>

      {/* Failure banner */}
      {failed && (
        <div className="relative mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/8 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-sm font-medium text-danger">Something interrupted the pipeline</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {data.errorMessage ??
                'A stage failed. Retry resumes from the last safe checkpoint — no double charges.'}
            </p>
          </div>
          <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Stage timeline — fits the width, wraps on narrower screens (no scroll) */}
      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {PIPELINE_STAGES.map((stage, i) => (
          <StageCard
            key={stage.key}
            stage={stage}
            state={nodeState(i)}
            pct={stagePct(i)}
            metric={stageMetric(i)}
            eta={nodeState(i) === 'active' ? eta : undefined}
          />
        ))}
      </div>
    </div>
  );
}
