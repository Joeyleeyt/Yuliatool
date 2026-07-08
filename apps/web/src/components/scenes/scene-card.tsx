'use client';

import { Film, ImageIcon, RotateCw, PencilLine, Download, Loader2 } from 'lucide-react';
import type { SceneView } from '@/lib/api/types';
import { Badge, Button } from '@/components/ui/primitives';
import { StatusDot } from '@/components/status-badge';

const ACTIVE = new Set(['pending', 'processing', 'submitted', 'generating', 'downloading']);

/** A single scene as a Pinterest-grid tile: preview → narration → prompt → actions. */
export function SceneCard({ scene }: { scene: SceneView }) {
  const isVideo = scene.visual_type === 'video';
  const seconds = Math.max(0, Math.round(scene.end_sec - scene.start_sec));
  const status = scene.assetStatus ?? 'pending';

  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline transition-all duration-300 ease-premium hover:-translate-y-1 hover:shadow-lg">
      {/* Preview */}
      <div className="relative aspect-video overflow-hidden">
        <Preview scene={scene} />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span className="rounded-md bg-fg/55 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur">
            #{scene.scene_index + 1}
          </span>
          <Badge tone={isVideo ? 'violet' : 'amber'}>
            {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {isVideo ? 'Clip' : 'Still'}
          </Badge>
        </div>
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-fg/55 px-1.5 py-0.5 font-mono text-[11px] text-white backdrop-blur">
          {seconds}s
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 font-medium tracking-tight text-fg">
            {scene.title ?? `Scene ${scene.scene_index + 1}`}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] capitalize text-fg-subtle">
            <StatusDot status={status} />
            {status}
          </span>
        </div>

        {scene.summary && <p className="text-sm leading-relaxed text-fg-muted">{scene.summary}</p>}

        {scene.narration_text && (
          <p className="border-l-2 border-accent/25 pl-3 text-sm italic leading-relaxed text-fg-muted">
            &ldquo;{scene.narration_text}&rdquo;
          </p>
        )}

        {scene.prompt?.positive_prompt && (
          <div className="rounded-xl border border-line/8 bg-surface-2/70 p-3">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">Prompt</p>
            <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">
              {scene.prompt.positive_prompt}
            </p>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {scene.assetUrl && (
            <a href={scene.assetUrl} download target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <Download className="h-3.5 w-3.5" />
                Download
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
  );
}

function Preview({ scene }: { scene: SceneView }) {
  const status = scene.assetStatus ?? 'pending';

  if (!scene.assetUrl) {
    const active = ACTIVE.has(status);
    const Icon = active ? Loader2 : scene.visual_type === 'video' ? Film : ImageIcon;
    return (
      <div className="relative flex h-full min-h-44 flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-surface-2 to-surface-3">
        <div className="pointer-events-none absolute inset-0 bg-grain" />
        <Icon
          className={`relative h-6 w-6 ${active ? 'animate-spin text-accent' : 'text-fg-subtle'}`}
        />
        <span className="relative text-[11px] uppercase tracking-wide text-fg-subtle capitalize">
          {status}
        </span>
      </div>
    );
  }
  return scene.visual_type === 'video' ? (
    <video src={scene.assetUrl} controls className="h-full w-full bg-black object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={scene.assetUrl} alt={scene.title ?? 'scene'} className="h-full w-full object-cover" />
  );
}
