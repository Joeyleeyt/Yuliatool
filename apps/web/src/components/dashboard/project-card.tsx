'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, Film, Loader2, AlertTriangle, Clapperboard, Clock } from 'lucide-react';
import type { ProjectListRow } from '@/lib/api/types';
import { StatusBadge } from '@/components/status-badge';
import { stageIndexForStatus } from '@/components/pipeline/stages';
import { cn, formatDurationLong } from '@/lib/utils';

const TERMINAL = new Set(['completed', 'failed']);
// Index of the 'video' stage in PIPELINE_STAGES — a project at or past this
// point has actually invoked the video-generation engine.
const VIDEO_STAGE_INDEX = 4;

// A small rotation of on-brand duotone treatments (violet/blue accent pair +
// a couple of complementary hues) so a page of completed films reads as a
// real library, not one gradient repeated 20 times. Seeded by project id.
const COMPLETED_TREATMENTS = [
  'from-accent/30 via-accent-2/10',
  'from-accent-2/30 via-accent/10',
  'from-fuchsia-500/22 via-accent/10',
  'from-sky-500/22 via-accent-2/10',
  'from-amber-500/18 via-accent/8',
];

function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** Status → thumbnail treatment (completed rotates through a seeded palette). */
function thumbTint(status: string, id: string): string {
  if (status === 'completed') return COMPLETED_TREATMENTS[hashIndex(id, COMPLETED_TREATMENTS.length)]!;
  if (status === 'failed') return 'from-danger/22 via-danger/6';
  if (status === 'created' || status === 'uploading_audio' || status === 'queued')
    return 'from-surface-3 via-surface-2';
  return 'from-accent/25 via-accent-2/8'; // actively generating
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

export function ProjectCard({ project }: { project: ProjectListRow }) {
  const vertical = project.render_format === 'vertical_1080x1920';
  const failed = project.status === 'failed';
  const done = project.status === 'completed';
  const active =
    !TERMINAL.has(project.status) &&
    project.status !== 'created' &&
    project.status !== 'queued';
  const pct =
    project.total_scenes > 0
      ? Math.round((project.completed_scenes / project.total_scenes) * 100)
      : 0;
  const runtime = formatDurationLong(project.latestRenderDurationSec);
  const generatedWithVeo = stageIndexForStatus(project.status) >= VIDEO_STAGE_INDEX || done;

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline transition-colors hover:border-line/16 hover:shadow-lg"
    >
      {/* Poster */}
      <Link href={`/projects/${project.id}`} className="relative block aspect-video overflow-hidden">
        <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent', thumbTint(project.status, project.id))} />
        {/* poster vignette — anchors the center glyph and reads as deliberate art direction */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_20%,transparent_35%,rgb(0_0_0/0.10)_100%)]" />
        <div className="absolute inset-0 bg-grain" />

        <div className="absolute inset-0 grid place-items-center">
          {done ? (
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-1/90 shadow-soft ring-1 ring-inset ring-line/10 backdrop-blur transition-transform duration-300 ease-premium group-hover:scale-110">
              <Play className="h-5 w-5 translate-x-0.5 text-accent" />
            </div>
          ) : failed ? (
            <AlertTriangle className="h-7 w-7 text-danger/70" />
          ) : active ? (
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          ) : (
            <Film className="h-7 w-7 text-fg-subtle" />
          )}
        </div>

        <div className="absolute left-3 top-3">
          <StatusBadge status={project.status} />
        </div>
        <div className="absolute bottom-3 right-3 rounded-md bg-surface-1/85 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted ring-1 ring-inset ring-line/10 backdrop-blur">
          {vertical ? '9:16' : '16:9'}
        </div>
        {runtime && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md bg-surface-1/85 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-inset ring-line/10 backdrop-blur">
            <Clock className="h-2.5 w-2.5" />
            {runtime}
          </div>
        )}

        {/* live progress on the thumbnail base */}
        {active && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-line/15">
            <div
              className="h-full bg-gradient-to-r from-accent-soft to-accent transition-[width] duration-700"
              style={{ width: `${Math.max(6, pct)}%` }}
            />
          </div>
        )}
      </Link>

      {/* Meta */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Link href={`/projects/${project.id}`} className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{project.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-subtle">
            <span>{relativeDate(project.created_at)}</span>
            {project.total_scenes > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clapperboard className="h-3 w-3" />
                  {done || failed
                    ? `${project.total_scenes} AI shots`
                    : `${project.completed_scenes}/${project.total_scenes} AI shots`}
                </span>
              </>
            )}
            {active && (
              <span className="ml-auto shrink-0 rounded-full bg-accent/8 px-2 py-0.5 font-mono text-[11px] font-medium text-accent">
                {pct}%
              </span>
            )}
          </div>
          {generatedWithVeo && (
            <p className="mt-1.5 text-[11px] text-fg-subtle">Generated with Veo 3</p>
          )}
        </Link>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Link href={`/projects/${project.id}`} className="flex-1">
            <span className="flex h-8 w-full items-center justify-center rounded-lg border border-line/12 text-xs font-medium text-fg transition-colors group-hover:border-line/20 hover:bg-surface-2">
              Open
            </span>
          </Link>
          {done && (
            <Link href={`/projects/${project.id}`} className="flex-1">
              <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-medium text-white transition-colors hover:bg-accent/90">
                <Play className="h-3 w-3" />
                Play
              </span>
            </Link>
          )}
        </div>
      </div>
    </motion.article>
  );
}
