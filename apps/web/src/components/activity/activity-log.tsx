'use client';

import { motion } from 'framer-motion';
import {
  AudioLines,
  Brain,
  Wand2,
  Video,
  Image as ImageIcon,
  Clapperboard,
  Download,
  Upload,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityLogRow } from '@/lib/api/types';
import { cn } from '@/lib/utils';

type Status = 'active' | 'done' | 'error';

/** Which AI crew member owns this event — inferred from the event type. */
function personaFor(type: string): { name: string; icon: LucideIcon } {
  const t = type.toLowerCase();
  if (t.includes('transcri')) return { name: 'AI Transcriber', icon: AudioLines };
  if (t.includes('analy') || t.includes('story') || t.includes('segment') || t.includes('plan'))
    return { name: 'AI Director', icon: Brain };
  if (t.includes('prompt')) return { name: 'AI Writer', icon: Wand2 };
  if (t.includes('video') || t.includes('veo') || t.includes('clip'))
    return { name: 'AI Cinematographer', icon: Video };
  if (t.includes('image') || t.includes('still') || t.includes('art'))
    return { name: 'AI Artist', icon: ImageIcon };
  if (t.includes('render') || t.includes('ffmpeg') || t.includes('mux') || t.includes('edit'))
    return { name: 'AI Editor', icon: Clapperboard };
  if (t.includes('download') || t.includes('store') || t.includes('asset'))
    return { name: 'AI Producer', icon: Download };
  if (t.includes('upload')) return { name: 'Voiceover', icon: Upload };
  return { name: 'Studio', icon: Sparkles };
}

/**
 * Badge status for a logged event. Activity entries are APPEND-ONLY records of
 * things that ALREADY happened, so a past event is never "Working" — the only
 * reason a stage-transition row (`status_changed`, message "rendering →
 * completed") used to show Working was that its `type` matched none of the
 * done-keywords and fell through to the 'active' default. Treat a completed
 * transition as done (or error, when it moved INTO a failed/terminal state),
 * reading the destination from `data.to` when present.
 */
function statusFor(row: ActivityLogRow): Status {
  const t = row.type.toLowerCase();
  // Explicit failure events.
  if (t.includes('fail') || t.includes('error')) return 'error';

  // Stage transitions carry the destination state in data.to (or the message
  // "from → to"). A transition INTO 'failed' is an error; any other completed
  // transition is done — it is a historical fact, not in-progress work.
  const to = extractTo(row);
  if (to) {
    if (to.includes('fail') || to.includes('error')) return 'error';
    return 'done';
  }

  if (
    t.includes('complete') ||
    t.includes('done') ||
    t.includes('stored') ||
    t.includes('ready') ||
    t.includes('success') ||
    t.includes('changed') || // status_changed: a completed transition
    t.includes('resumed') ||
    t.includes('created')
  )
    return 'done';
  return 'active';
}

/** Read the destination stage of a transition event from data.to, else the
 * "from → to" message tail. Returns a lowercased state, or null if not a
 * transition. */
function extractTo(row: ActivityLogRow): string | null {
  const data = row.data as { to?: unknown } | null | undefined;
  if (data && typeof data.to === 'string') return data.to.toLowerCase();
  const m = row.message?.match(/→\s*([a-z_]+)\s*$/i);
  return m ? m[1]!.toLowerCase() : null;
}

const medallion: Record<Status, string> = {
  active: 'bg-accent/12 text-accent ring-accent/25',
  done: 'bg-success/12 text-success ring-success/25',
  error: 'bg-danger/12 text-danger ring-danger/25',
};
const statusIcon: Record<Status, LucideIcon> = {
  active: Loader2,
  done: Check,
  error: AlertCircle,
};

function humanize(type: string): string {
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function ts(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ActivityLog({ items }: { items: ActivityLogRow[] }) {
  // Newest first — the studio's latest move sits at the top.
  const ordered = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline">
      <div className="flex items-center gap-2 border-b border-line/8 px-5 py-3.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-sm font-medium tracking-tight text-fg">Studio activity</span>
        <span className="ml-auto font-mono text-[11px] text-fg-subtle">{ordered.length} events</span>
      </div>

      <div className="max-h-[480px] overflow-y-auto p-4">
        {ordered.map((a, i) => {
          const persona = personaFor(a.type);
          const status = statusFor(a);
          const PersonaIcon = persona.icon;
          const StatusIcon = statusIcon[status];
          const last = i === ordered.length - 1;

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.25), duration: 0.3 }}
              className="relative flex gap-3.5"
            >
              {/* Persona rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
                    medallion[status],
                  )}
                >
                  <PersonaIcon className="h-[18px] w-[18px]" />
                </span>
                {!last && <span className="w-px flex-1 bg-line/10" />}
              </div>

              {/* Event card */}
              <div className="mb-3 flex-1 rounded-xl border border-line/8 bg-surface-1 p-3.5 shadow-soft">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tracking-tight text-fg">{persona.name}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      status === 'done' && 'bg-success/10 text-success',
                      status === 'error' && 'bg-danger/10 text-danger',
                      status === 'active' && 'bg-accent/10 text-accent',
                    )}
                  >
                    <StatusIcon className={cn('h-3 w-3', status === 'active' && 'animate-spin')} />
                    {status === 'done' ? 'Done' : status === 'error' ? 'Failed' : 'Working'}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-subtle">
                    {ts(a.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                  {a.message || humanize(a.type)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
