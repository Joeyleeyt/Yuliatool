'use client';

import { motion } from 'framer-motion';
import { Film, ImageIcon, Play } from 'lucide-react';
import type { SceneView } from '@/lib/api/types';
import { Badge } from '@/components/ui/primitives';
import { sceneStatusMeta } from './scene-status';
import { cn } from '@/lib/utils';

/**
 * Compact preview tile. Shows only: number, type, thumbnail, duration, title,
 * status. Click opens the full inspector — nothing else lives on the card.
 */
export function SceneCard({ scene, onOpen }: { scene: SceneView; onOpen: (s: SceneView) => void }) {
  const isVideo = scene.visual_type === 'video';
  const seconds = Math.max(0, Math.round(scene.end_sec - scene.start_sec));
  const meta = sceneStatusMeta(scene.assetStatus);
  const StatusIcon = meta.icon;

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(scene)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-full flex-col overflow-hidden rounded-[18px] border border-line/8 bg-surface-1 text-left shadow-soft ring-hairline transition-colors hover:border-line/16 hover:shadow-lg"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        <Thumb scene={scene} kind={meta.kind} isVideo={isVideo} />

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

      {/* Meta */}
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-fg">
          {scene.title ?? `Scene ${scene.scene_index + 1}`}
        </p>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium',
            meta.tone === 'emerald' && 'text-success',
            meta.tone === 'violet' && 'text-accent',
            meta.tone === 'red' && 'text-danger',
            meta.tone === 'neutral' && 'text-fg-subtle',
          )}
        >
          <StatusIcon className={cn('h-3 w-3', meta.kind === 'active' && 'animate-spin')} />
          {meta.label}
        </span>
      </div>
    </motion.button>
  );
}

function Thumb({
  scene,
  kind,
  isVideo,
}: {
  scene: SceneView;
  kind: ReturnType<typeof sceneStatusMeta>['kind'];
  isVideo: boolean;
}) {
  // Ready asset → show the real media (fades in).
  if (scene.assetUrl) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-full w-full"
      >
        {isVideo ? (
          <>
            <video src={scene.assetUrl} muted playsInline className="h-full w-full bg-black object-cover" />
            <div className="absolute inset-0 grid place-items-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/40 backdrop-blur">
                <Play className="h-4 w-4 translate-x-0.5 text-white" />
              </span>
            </div>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.assetUrl} alt={scene.title ?? 'scene'} className="h-full w-full object-cover" />
        )}
      </motion.div>
    );
  }

  // Generating → shimmering skeleton. Pending → calm placeholder.
  const generating = kind === 'active';
  const Icon = isVideo ? Film : ImageIcon;
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3',
        generating && 'animate-shimmer bg-[length:200%_100%] from-surface-2 via-surface-3 to-surface-2',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-grain" />
      <Icon className={cn('relative h-6 w-6', generating ? 'text-accent/60' : 'text-fg-subtle/60')} />
    </div>
  );
}
