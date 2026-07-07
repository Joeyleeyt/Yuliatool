'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, Film, Loader2 } from 'lucide-react';
import type { ProjectRow } from '@/lib/api/types';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';

const TERMINAL = new Set(['completed', 'failed']);

/** Status → thumbnail tint. */
function thumbTint(status: string): string {
  if (status === 'completed') return 'from-emerald-500/25 via-teal-500/8';
  if (status === 'failed') return 'from-red-500/25 via-rose-500/8';
  if (status === 'created' || status === 'uploading_audio') return 'from-surface-3 via-surface-2';
  return 'from-violet-500/25 via-fuchsia-500/8'; // actively generating
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ProjectCard({ project }: { project: ProjectRow }) {
  const vertical = project.render_format === 'vertical_1080x1920';
  const active = !TERMINAL.has(project.status) && project.status !== 'created';
  const done = project.status === 'completed';
  const pct =
    project.total_scenes > 0
      ? Math.round((project.completed_scenes / project.total_scenes) * 100)
      : 0;

  return (
    <Link href={`/projects/${project.id}`}>
      <motion.article
        whileHover={{ y: -4 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="group h-full overflow-hidden rounded-2xl border border-line/8 bg-surface-1 ring-hairline transition-colors hover:border-line/16 hover:shadow-lg"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden">
          <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent', thumbTint(project.status))} />
          <div className="absolute inset-0 bg-grain" />

          <div className="absolute inset-0 grid place-items-center">
            {done ? (
              <div className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/30 backdrop-blur transition-transform duration-300 ease-premium group-hover:scale-110">
                <Play className="h-5 w-5 translate-x-0.5 text-white" />
              </div>
            ) : active ? (
              <Loader2 className="h-7 w-7 animate-spin text-white/70" />
            ) : (
              <Film className="h-7 w-7 text-white/40" />
            )}
          </div>

          <div className="absolute left-3 top-3">
            <StatusBadge status={project.status} />
          </div>
          <div className="absolute bottom-3 right-3 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/80 backdrop-blur">
            {vertical ? '9:16' : '16:9'}
          </div>

          {/* live progress on the thumbnail base */}
          {active && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/30">
              <div
                className="h-full bg-gradient-to-r from-accent-soft to-accent transition-[width] duration-700"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{project.title}</p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              {relativeDate(project.created_at)}
              {project.total_scenes > 0 && ` · ${project.total_scenes} scenes`}
            </p>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
