'use client';

import { useRender } from '@/lib/query/hooks';
import { formatSeconds } from '@/lib/utils';
import { Button, Card, CardContent, Progress, Skeleton } from '@/components/ui/primitives';

export function RenderView({ id }: { id: string }) {
  const { data, isLoading } = useRender(id);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const render = data?.render;

  if (!render)
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-500">
          The final video appears here once every scene is generated.
        </CardContent>
      </Card>
    );

  const isDone = render.status === 'completed' && data?.url;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        {isDone ? (
          <>
            <video src={data.url!} controls className="w-full rounded-lg bg-black" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                {render.format} · {formatSeconds(render.duration_sec)} · {render.fps ?? '—'} fps
              </span>
              <a href={data.url!} download>
                <Button>Download MP4</Button>
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize">{render.status.replace(/_/g, ' ')}</span>
              <span className="text-neutral-500">{render.progress}%</span>
            </div>
            <Progress value={render.progress} />
            {render.error_message && <p className="text-sm text-red-600">{render.error_message}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
