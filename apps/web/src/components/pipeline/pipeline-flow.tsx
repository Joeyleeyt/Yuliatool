'use client';

import { RotateCw, AlertCircle } from 'lucide-react';
import { useProjectStatus, useRetryProject } from '@/lib/query/hooks';
import { PIPELINE_STAGES, stageIndexForStatus } from './stages';
import { PipelineNode, type NodeState } from './pipeline-node';
import { ProgressIndicator } from './progress-indicator';
import { GenerationTimer } from './generation-timer';
import { Badge, Button } from '@/components/ui/primitives';
import { PROJECT_STATUS_META } from '@yulia/core/enums';

export function PipelineFlow({ id }: { id: string }) {
  const { data } = useProjectStatus(id);
  const retry = useRetryProject(id);

  const running = data ? !['completed', 'failed', 'created'].includes(data.status) : false;

  if (!data) return null;

  const failed = data.status === 'failed';
  const completed = data.status === 'completed';
  const cs = stageIndexForStatus(data.status);
  const meta = PROJECT_STATUS_META[data.status as keyof typeof PROJECT_STATUS_META];

  const nodeState = (i: number): NodeState => {
    if (completed) return 'done';
    if (failed) return i < cs ? 'done' : i === cs ? 'error' : 'pending';
    if (i < cs) return 'done';
    if (i === cs) return 'active';
    return 'pending';
  };

  const activeDetail = (i: number): string | undefined => {
    if (nodeState(i) !== 'active') return undefined;
    const key = PIPELINE_STAGES[i]!.key;
    if (key === 'planning') return data.totalScenes > 0 ? `${data.totalScenes} scenes planned` : 'Segmenting the story…';
    if (key === 'video' || key === 'image')
      return `Generating · ${data.completedScenes}/${data.totalScenes} scenes ready`;
    return undefined;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/8 bg-surface-1 p-6 shadow-soft ring-hairline">
      {running && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-editorial-glow opacity-70" />
      )}
      {/* Header */}
      <div className="mb-6 flex items-center gap-5">
        <ProgressIndicator
          value={completed ? 100 : data.progress}
          tone={failed ? 'danger' : completed ? 'success' : 'accent'}
          label="done"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium tracking-tight text-fg">
              {completed ? 'Production complete' : failed ? 'Production halted' : 'Studio at work'}
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
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {meta?.label ?? data.status}
            {data.totalScenes > 0 && ` · ${data.completedScenes}/${data.totalScenes} scenes ready`}
          </p>
          <div className="mt-1">
            <GenerationTimer
              startedAt={data.startedAt}
              completedAt={data.completedAt}
              durationSec={data.durationSec}
              running={running}
            />
          </div>
        </div>
      </div>

      {/* Failure banner */}
      {failed && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/8 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-sm font-medium text-danger">Something interrupted the pipeline</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {data.errorMessage ?? 'A stage failed. Retry resumes from the last safe checkpoint — no double charges.'}
            </p>
          </div>
          <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Nodes */}
      <div>
        {PIPELINE_STAGES.map((stage, i) => (
          <PipelineNode
            key={stage.key}
            stage={stage}
            state={nodeState(i)}
            isLast={i === PIPELINE_STAGES.length - 1}
            detail={activeDetail(i)}
          />
        ))}
      </div>
    </div>
  );
}
