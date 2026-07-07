'use client';

import { useActivity } from '@/lib/query/hooks';
import { Card, CardContent, Skeleton } from '@/components/ui/primitives';

export function ActivityView({ id }: { id: string }) {
  const { data, isLoading } = useActivity(id);
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const items = data?.activity ?? [];
  if (items.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-500">No activity yet.</CardContent>
      </Card>
    );

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm font-medium">{a.type.replace(/_/g, ' ')}</p>
                {a.message && <p className="text-sm text-neutral-500">{a.message}</p>}
              </div>
              <span className="shrink-0 text-xs text-neutral-400">
                {new Date(a.created_at).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
