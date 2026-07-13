'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  Film,
  Image as ImageIcon,
  AudioLines,
  File,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAssets } from '@/lib/query/hooks';
import type { AssetView } from '@/lib/api/types';
import { formatBytes, formatSeconds } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { IconTile, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

// --- taxonomy ---------------------------------------------------------------
type Tone = 'emerald' | 'violet' | 'amber' | 'red' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  stored: { label: 'Stored', tone: 'emerald' },
  generated: { label: 'Generated', tone: 'violet' },
  downloading: { label: 'Downloading', tone: 'amber' },
  submitted: { label: 'Submitted', tone: 'amber' },
  pending: { label: 'Pending', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'red' },
};
// Completed first, then in-flight, then waiting, then failures.
const STATUS_ORDER = ['stored', 'generated', 'downloading', 'submitted', 'pending', 'failed'];

const KIND_LABEL: Record<string, string> = {
  video_clip: 'Clip',
  render: 'Final render',
  image: 'Still',
  thumbnail: 'Thumbnail',
  voiceover: 'Voiceover',
  temp: 'Temp',
};

const KIND_ICON: Record<string, LucideIcon> = {
  video_clip: Film,
  render: Film,
  image: ImageIcon,
  thumbnail: ImageIcon,
  voiceover: AudioLines,
  temp: File,
};

const MEDIA_GROUPS: { key: string; label: string; icon: LucideIcon; kinds: Set<string> }[] = [
  { key: 'video', label: 'Video', icon: Film, kinds: new Set(['video_clip', 'render']) },
  { key: 'images', label: 'Images', icon: ImageIcon, kinds: new Set(['image', 'thumbnail']) },
  { key: 'audio', label: 'Audio', icon: AudioLines, kinds: new Set(['voiceover']) },
  { key: 'other', label: 'Other', icon: File, kinds: new Set(['temp']) },
];

const dotClass: Record<Tone, string> = {
  emerald: 'bg-success',
  violet: 'bg-accent',
  amber: 'bg-warning',
  red: 'bg-danger',
  neutral: 'bg-fg-subtle',
};
const textClass: Record<Tone, string> = {
  emerald: 'text-success',
  violet: 'text-accent',
  amber: 'text-warning',
  red: 'text-danger',
  neutral: 'text-fg-subtle',
};

function groupKeyFor(kind: string): string {
  return MEDIA_GROUPS.find((g) => g.kinds.has(kind))?.key ?? 'other';
}

// --- view -------------------------------------------------------------------
export function AssetsView({ id }: { id: string }) {
  const { data, isLoading } = useAssets(id);
  const assets = data?.assets ?? [];

  const groups = useMemo(
    () =>
      MEDIA_GROUPS.map((g) => ({
        ...g,
        items: assets.filter((a) => groupKeyFor(a.kind) === g.key),
      })).filter((g) => g.items.length > 0),
    [assets],
  );

  const [active, setActive] = useState<string | null>(null);
  const activeKey = active ?? groups[0]?.key ?? null;
  const activeGroup = groups.find((g) => g.key === activeKey);

  if (isLoading) return <Skeleton className="h-52 w-full rounded-2xl" />;

  if (assets.length === 0)
    return (
      <EmptyState
        icon={Film}
        title="No assets yet"
        description="Generated clips, stills, and the final master will land here as the studio produces them."
      />
    );

  return (
    <div className="flex flex-col gap-6">
      {/* Media tabs */}
      <div className="inline-flex w-fit items-center gap-1 rounded-xl border border-line/8 bg-surface-1 p-1 ring-hairline">
        {groups.map((g) => {
          const isActive = g.key === activeKey;
          const Icon = g.icon;
          return (
            <button
              key={g.key}
              onClick={() => setActive(g.key)}
              className={cn(
                'relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="asset-media-tab"
                  className="absolute inset-0 rounded-lg bg-surface-3 ring-1 ring-inset ring-line/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className={cn('h-4 w-4', isActive && 'text-accent')} />
                {g.label}
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                  {g.items.length}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Active tab body — fixed height, scrolls when it overflows */}
      <div className="-mr-2 max-h-[560px] overflow-y-auto pr-2">
        {activeGroup && <MediaGroupBody key={activeGroup.key} items={activeGroup.items} />}
      </div>
    </div>
  );
}

function MediaGroupBody({ items }: { items: AssetView[] }) {
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    items: items.filter((a) => a.status === status),
  })).filter((b) => b.items.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6"
    >
      {byStatus.map(({ status, items: statusItems }) => {
        const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone };
        return (
          <div key={status}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[meta.tone])} />
              <span className={cn('text-xs font-medium', textClass[meta.tone])}>{meta.label}</span>
              <span className="font-mono text-[11px] text-fg-subtle">{statusItems.length}</span>
            </div>
            {/* two columns */}
            <div className="grid gap-3 sm:grid-cols-2">
              {statusItems.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

function AssetCard({ asset: a }: { asset: AssetView }) {
  const Icon = KIND_ICON[a.kind] ?? File;
  const dims = a.width && a.height ? `${a.width}×${a.height}` : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/8 bg-surface-1 p-3.5 shadow-soft ring-hairline transition-colors hover:border-line/16">
      <div className="flex min-w-0 items-center gap-3">
        <IconTile size="sm">
          <Icon className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{KIND_LABEL[a.kind] ?? a.kind}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">
            {[dims, a.provider].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[11px] text-fg-subtle">
        <div className="flex items-center gap-3">
          {a.size_bytes ? <span>{formatBytes(a.size_bytes)}</span> : null}
          {a.duration_sec ? <span>{formatSeconds(a.duration_sec)}</span> : null}
        </div>
        {a.url ? (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        ) : (
          <span className="text-fg-subtle/50">—</span>
        )}
      </div>
    </div>
  );
}
