'use client';

import { Download, PlaySquare, Copy, Clapperboard } from 'lucide-react';
import { useRender, useCost } from '@/lib/query/hooks';
import { formatSeconds } from '@/lib/utils';
import { Button, Progress, Skeleton } from '@/components/ui/primitives';

const RESOLUTION: Record<string, string> = {
  vertical_1080x1920: '1080 × 1920',
  horizontal_1920x1080: '1920 × 1080',
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</span>
      <span className="mt-0.5 font-mono text-sm text-fg">{value}</span>
    </div>
  );
}

export function VideoPlayer({ id, title }: { id: string; title?: string }) {
  const { data, isLoading } = useRender(id);
  const { data: cost } = useCost(id);

  if (isLoading) return <Skeleton className="aspect-video w-full rounded-2xl" />;
  const render = data?.render;
  if (!render) return null;

  const ready = render.status === 'completed' && data?.url;

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 ring-hairline">
      <div className="relative aspect-video bg-black">
        {ready ? (
          <video src={data.url!} controls poster={undefined} className="h-full w-full" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-500/15 to-transparent">
            <div className="absolute inset-0 bg-grain" />
            <Clapperboard className="relative h-8 w-8 text-white/50" />
            <div className="relative w-64">
              <div className="mb-2 flex justify-between font-mono text-xs text-white/70">
                <span>Rendering…</span>
                <span>{render.progress}%</span>
              </div>
              <Progress value={render.progress} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-6">
          {title && <Meta label="Title" value={title} />}
          <Meta label="Resolution" value={RESOLUTION[render.format] ?? render.format} />
          <Meta label="Duration" value={formatSeconds(render.duration_sec)} />
          <Meta label="FPS" value={render.fps ? String(render.fps) : '—'} />
          {cost && cost.totalUsd > 0 && <Meta label="Cost" value={`$${cost.totalUsd.toFixed(2)}`} />}
        </div>

        <div className="flex items-center gap-2">
          {ready && (
            <a href={data.url!} download>
              <Button size="sm">
                <Download className="h-3.5 w-3.5" />
                Download MP4
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" disabled title="Coming soon">
            <PlaySquare className="h-3.5 w-3.5" />
            Publish
          </Button>
          <Button size="sm" variant="ghost" disabled title="Coming soon">
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
        </div>
      </div>
    </div>
  );
}
