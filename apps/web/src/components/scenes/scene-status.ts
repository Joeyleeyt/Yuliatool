import { Check, Loader2, Clock, AlertCircle, type LucideIcon } from 'lucide-react';

export type SceneKind = 'pending' | 'active' | 'done' | 'error';

const DONE = new Set(['stored', 'completed', 'complete', 'ready', 'done', 'success']);
const ERROR = new Set(['failed', 'error', 'cancelled', 'canceled']);
const PENDING = new Set(['pending', 'created', 'queued', 'waiting', '']);

export interface SceneStatusMeta {
  kind: SceneKind;
  label: string;
  tone: 'neutral' | 'violet' | 'emerald' | 'red';
  icon: LucideIcon;
}

/** Collapse the many raw asset statuses into the three studio states (+ error). */
export function sceneStatusMeta(status: string | null | undefined): SceneStatusMeta {
  const s = (status ?? '').toLowerCase();
  if (DONE.has(s)) return { kind: 'done', label: 'Complete', tone: 'emerald', icon: Check };
  if (ERROR.has(s)) return { kind: 'error', label: 'Failed', tone: 'red', icon: AlertCircle };
  if (PENDING.has(s)) return { kind: 'pending', label: 'Pending', tone: 'neutral', icon: Clock };
  return { kind: 'active', label: 'Generating', tone: 'violet', icon: Loader2 };
}
