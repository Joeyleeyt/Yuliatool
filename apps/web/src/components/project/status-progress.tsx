'use client';

import { useProjectStatus } from '@/lib/query/hooks';
import { PROJECT_STATUS_META } from '@yulia/core/enums';
import { Card, CardContent, Progress } from '@/components/ui/primitives';

export function StatusProgress({ id }: { id: string }) {
  const { data } = useProjectStatus(id);
  if (!data) return null;
  const meta = PROJECT_STATUS_META[data.status as keyof typeof PROJECT_STATUS_META];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{meta?.label ?? data.status}</span>
          <span className="text-neutral-500">{data.progress}%</span>
        </div>
        <Progress value={data.progress} />
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {data.completedScenes}/{data.totalScenes} scenes ready
          </span>
          {data.errorMessage && <span className="text-red-600">{data.errorMessage}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
