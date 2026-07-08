'use client';

import { Clapperboard } from 'lucide-react';
import { useScenes } from '@/lib/query/hooks';
import { SceneCard } from '@/components/scenes/scene-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/primitives';

export function ScenesView({ id }: { id: string }) {
  const { data, isLoading } = useScenes(id);
  if (isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  const scenes = data?.scenes ?? [];

  if (scenes.length === 0)
    return (
      <EmptyState
        icon={Clapperboard}
        title="No scenes yet"
        description="Scenes appear once the story is analysed and segmented into shots."
      />
    );

  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:break-inside-avoid">
      {scenes.map((scene) => (
        <SceneCard key={scene.id} scene={scene} />
      ))}
    </div>
  );
}
