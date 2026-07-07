'use client';

import { useScenes } from '@/lib/query/hooks';
import { formatSeconds } from '@/lib/utils';
import type { SceneView } from '@/lib/api/types';
import { Badge, Card, CardContent, Skeleton } from '@/components/ui/primitives';

export function ScenesView({ id }: { id: string }) {
  const { data, isLoading } = useScenes(id);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const scenes = data?.scenes ?? [];
  if (scenes.length === 0)
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-500">
          Scenes appear after analysis and segmentation.
        </CardContent>
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      {scenes.map((scene) => (
        <SceneCard key={scene.id} scene={scene} />
      ))}
    </div>
  );
}

function SceneCard({ scene }: { scene: SceneView }) {
  const isVideo = scene.visual_type === 'video';
  return (
    <Card>
      <CardContent className="grid gap-4 py-4 md:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">#{scene.scene_index + 1}</span>
            <Badge tone={isVideo ? 'blue' : 'amber'}>{scene.visual_type}</Badge>
          </div>
          <span className="text-xs text-neutral-500">
            {formatSeconds(scene.start_sec)}–{formatSeconds(scene.end_sec)}
          </span>
          <Preview scene={scene} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-medium">{scene.title}</p>
          <p className="text-sm text-neutral-500">{scene.summary}</p>
          <p className="text-sm italic text-neutral-400">“{scene.narration_text}”</p>
          {scene.prompt && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-neutral-500">Prompt</summary>
              <p className="mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
                {scene.prompt.positive_prompt}
              </p>
              {scene.prompt.negative_prompt && (
                <p className="mt-1 text-xs text-neutral-400">Negative: {scene.prompt.negative_prompt}</p>
              )}
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Preview({ scene }: { scene: SceneView }) {
  if (!scene.assetUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400 dark:border-neutral-700">
        {scene.assetStatus ?? 'pending'}
      </div>
    );
  }
  return scene.visual_type === 'video' ? (
    <video src={scene.assetUrl} controls className="aspect-video w-full rounded-md bg-black" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={scene.assetUrl} alt={scene.title ?? 'scene'} className="aspect-video w-full rounded-md object-cover" />
  );
}
