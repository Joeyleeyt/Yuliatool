'use client';

import { Clapperboard } from 'lucide-react';
import { useScenes } from '@/lib/query/hooks';
import { SceneCard } from '@/components/scenes/scene-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/primitives';

export function ScenesView({ id }: { id: string }) {
  const { data, isLoading } = useScenes(id);
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
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
    <div className="flex flex-col gap-4">
      {scenes.map((scene) => (
        <SceneCard key={scene.id} scene={scene} />
      ))}
    </div>
  );
}
