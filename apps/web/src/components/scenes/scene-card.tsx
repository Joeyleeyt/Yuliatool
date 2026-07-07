'use client';

import { Film, ImageIcon, RotateCw, PencilLine, ExternalLink } from 'lucide-react';
import type { SceneView } from '@/lib/api/types';
import { Badge, Button } from '@/components/ui/primitives';
import { StatusDot } from '@/components/status-badge';
import { cn } from '@/lib/utils';

export function SceneCard({ scene }: { scene: SceneView }) {
  const isVideo = scene.visual_type === 'video';
  const seconds = Math.max(0, Math.round(scene.end_sec - scene.start_sec));

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 ring-hairline transition-colors hover:border-line/14">
      <div className="grid gap-0 md:grid-cols-[240px_1fr]">
        {/* Preview */}
        <div className="relative aspect-video md:aspect-auto md:h-full">
          <Preview scene={scene} />
          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
            <span className="rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur">
              #{scene.scene_index + 1}
            </span>
            <Badge tone={isVideo ? 'violet' : 'amber'}>
              {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
              {isVideo ? 'Clip' : 'Still'}
            </Badge>
          </div>
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-white/90 backdrop-blur">
            {seconds}s
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-fg">{scene.title ?? `Scene ${scene.scene_index + 1}`}</p>
              {scene.summary && <p className="mt-0.5 text-sm text-fg-muted">{scene.summary}</p>}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-subtle">
              <StatusDot status={scene.assetStatus ?? 'pending'} />
              {scene.assetStatus ?? 'pending'}
            </span>
          </div>

          {scene.narration_text && (
            <p className="border-l-2 border-line/12 pl-3 text-sm italic text-fg-muted">
              “{scene.narration_text}”
            </p>
          )}

          {scene.prompt?.positive_prompt && (
            <div className="rounded-lg border border-line/8 bg-surface-2/60 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">Prompt</p>
              <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">
                {scene.prompt.positive_prompt}
              </p>
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-1">
            {scene.assetUrl && (
              <a href={scene.assetUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview
                </Button>
              </a>
            )}
            <Button size="sm" variant="ghost" disabled title="Coming soon">
              <RotateCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button size="sm" variant="ghost" disabled title="Coming soon">
              <PencilLine className="h-3.5 w-3.5" />
              Edit prompt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Preview({ scene }: { scene: SceneView }) {
  if (!scene.assetUrl) {
    return (
      <div
        className={cn(
          'flex h-full min-h-40 items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3 text-xs text-fg-subtle',
        )}
      >
        <div className="absolute inset-0 bg-grain" />
        <span className="relative capitalize">{scene.assetStatus ?? 'pending'}</span>
      </div>
    );
  }
  return scene.visual_type === 'video' ? (
    <video src={scene.assetUrl} controls className="h-full min-h-40 w-full bg-black object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={scene.assetUrl}
      alt={scene.title ?? 'scene'}
      className="h-full min-h-40 w-full object-cover"
    />
  );
}
