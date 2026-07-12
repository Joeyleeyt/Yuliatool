'use client';

import { useEffect, useState } from 'react';
import { Clock, Timer } from 'lucide-react';

/**
 * Formats a whole-second duration as a compact, human clock: "2h 45m 24s",
 * "12m 40s", "45s". Always shows the largest two units so the number stays
 * scannable without losing precision on short runs.
 */
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Shows how long generation takes:
 *   - RUNNING  → a live-ticking "Elapsed" counter (now − startedAt), updated
 *     every second, so you can watch a long run in progress.
 *   - COMPLETE → the frozen total ("Generated in 2h 45m 24s"), taken from the
 *     authoritative server duration (completed_at − created_at). Falls back to
 *     computing it from the timestamps if the server didn't send durationSec.
 *
 * Only renders once the pipeline has actually started; idle/created shows
 * nothing. Respects reduced-motion by simply not animating (the tick is a text
 * update, not a transition).
 */
export function GenerationTimer({
  startedAt,
  completedAt,
  durationSec,
  running,
}: {
  startedAt: string;
  completedAt: string | null;
  durationSec: number | null;
  running: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick once a second while running so the elapsed counter advances live.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return null;

  // Completed: prefer the server's total; else derive from the timestamps.
  if (completedAt) {
    const total =
      durationSec ??
      Math.max(0, Math.round((Date.parse(completedAt) - startMs) / 1000));
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-subtle">
        <Timer className="h-3.5 w-3.5 text-success" aria-hidden />
        <span className="tabular-nums">Generated in {formatDuration(total)}</span>
      </span>
    );
  }

  // Running: live elapsed from start to now.
  if (running) {
    const elapsed = Math.max(0, Math.round((nowMs - startMs) / 1000));
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-subtle">
        <Clock className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span className="tabular-nums">Elapsed {formatDuration(elapsed)}</span>
      </span>
    );
  }

  return null;
}
