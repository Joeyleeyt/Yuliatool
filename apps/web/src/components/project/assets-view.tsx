'use client';

import { ExternalLink, Film, Image as ImageIcon, AudioLines, File, type LucideIcon } from 'lucide-react';
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
  if (isLoading) return <Skeleton className="h-52 w-full rounded-2xl" />;
  const assets = data?.assets ?? [];

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
      {MEDIA_GROUPS.map((group) => {
        const groupAssets = assets.filter((a) => groupKeyFor(a.kind) === group.key);
        if (groupAssets.length === 0) return null;
        return <MediaGroup key={group.key} label={group.label} icon={group.icon} assets={groupAssets} />;
      })}
    </div>
  );
}

function MediaGroup({
  label,
  icon: Icon,
  assets,
}: {
  label: string;
  icon: LucideIcon;
  assets: AssetView[];
}) {
  // Bucket by status, preserving the lifecycle order.
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    items: assets.filter((a) => a.status === status),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline">
      {/* Group header: media type + count + status tally */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line/8 p-4">
        <IconTile size="sm">
          <Icon className="h-4 w-4" />
        </IconTile>
        <div>
          <p className="text-sm font-medium tracking-tight text-fg">{label}</p>
          <p className="text-xs text-fg-subtle">
            {assets.length} {assets.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {byStatus.map(({ status, items }) => {
            const tone = STATUS_META[status]?.tone ?? 'neutral';
            return (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 rounded-full border border-line/8 bg-surface-2/60 px-2 py-0.5 text-[11px] text-fg-muted"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} />
                {items.length} {STATUS_META[status]?.label ?? status}
              </span>
            );
          })}
        </div>
      </div>

      {/* Status sub-groups */}
      <div className="divide-y divide-line/8">
        {byStatus.map(({ status, items }) => {
          const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone };
          return (
            <div key={status}>
              <div className="flex items-center gap-2 bg-surface-2/40 px-4 py-2">
                <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[meta.tone])} />
                <span className={cn('text-xs font-medium', textClass[meta.tone])}>{meta.label}</span>
                <span className="font-mono text-[11px] text-fg-subtle">{items.length}</span>
              </div>
              {items.map((a) => (
                <AssetRow key={a.id} asset={a} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetRow({ asset: a }: { asset: AssetView }) {
  const dims = a.width && a.height ? `${a.width}×${a.height}` : null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2/40">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-medium text-fg-muted">{KIND_LABEL[a.kind] ?? a.kind}</span>
        {dims && <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{dims}</span>}
        {a.provider && (
          <span className="hidden shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">
            {a.provider}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 font-mono text-xs text-fg-subtle">
        {a.size_bytes ? <span>{formatBytes(a.size_bytes)}</span> : null}
        {a.duration_sec ? <span>{formatSeconds(a.duration_sec)}</span> : null}
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
