'use client';

import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { useScenes } from '@/lib/query/hooks';
import type { SceneView } from '@/lib/api/types';
import { SceneCard } from '@/components/scenes/scene-card';
import { SceneInspector } from '@/components/scenes/scene-inspector';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/primitives';

export function ScenesView({ id }: { id: string }) {
  const { data, isLoading } = useScenes(id);
  const [selected, setSelected] = useState<SceneView | null>(null);

  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="overflow-hidden rounded-[18px] border border-line/8 bg-surface-1">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="flex items-center justify-between gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-14" />
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
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {scenes.map((scene) => (
          <SceneCard key={scene.id} scene={scene} onOpen={setSelected} />
        ))}
      </div>
      <SceneInspector scene={selected} onClose={() => setSelected(null)} />
    </>
  );
}
