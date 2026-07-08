'use client';

import { ExternalLink } from 'lucide-react';
import { useAssets } from '@/lib/query/hooks';
import { formatBytes, formatSeconds } from '@/lib/utils';
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/primitives';

export function AssetsView({ id }: { id: string }) {
  const { data, isLoading } = useAssets(id);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const assets = data?.assets ?? [];
  if (assets.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-fg-muted">
          Generated clips, stills, and the final master will land here.
        </CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-line/8">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div className="flex items-center gap-3">
                <Badge
                  tone={a.status === 'stored' ? 'emerald' : a.status === 'failed' ? 'red' : 'neutral'}
                >
                  {a.kind}
                </Badge>
                <span className="capitalize text-fg-muted">{a.status}</span>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs text-fg-subtle">
                <span>{formatBytes(a.size_bytes)}</span>
                <span>{formatSeconds(a.duration_sec)}</span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                ) : (
                  <span className="text-fg-subtle/50">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
