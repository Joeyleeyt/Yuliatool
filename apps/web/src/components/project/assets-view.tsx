'use client';

import { useAssets } from '@/lib/query/hooks';
import { formatBytes, formatSeconds } from '@/lib/utils';
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/primitives';

export function AssetsView({ id }: { id: string }) {
  const { data, isLoading } = useAssets(id);
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const assets = data?.assets ?? [];
  if (assets.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-500">No assets yet.</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="flex items-center gap-3">
                <Badge tone={a.status === 'stored' ? 'green' : a.status === 'failed' ? 'red' : 'neutral'}>
                  {a.kind}
                </Badge>
                <span className="text-neutral-500">{a.status}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <span>{formatBytes(a.size_bytes)}</span>
                <span>{formatSeconds(a.duration_sec)}</span>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="underline">
                    open
                  </a>
                ) : (
                  <span className="text-neutral-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
