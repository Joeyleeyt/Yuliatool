'use client';

import { ScrollText } from 'lucide-react';
import { useActivity } from '@/lib/query/hooks';
import { ActivityLog } from '@/components/activity/activity-log';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/primitives';

export function ActivityView({ id }: { id: string }) {
  const { data, isLoading } = useActivity(id);
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const items = data?.activity ?? [];

  if (items.length === 0)
    return (
      <EmptyState
        icon={ScrollText}
        title="No activity yet"
        description="Every step the studio takes will stream here in real time."
      />
    );

  return <ActivityLog items={items} />;
}
