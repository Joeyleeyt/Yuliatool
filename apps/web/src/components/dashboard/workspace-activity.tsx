'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useWorkspaceActivity } from '@/lib/query/hooks';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Status = 'active' | 'done' | 'error';

function statusFor(type: string): Status {
  const t = type.toLowerCase();
  if (t.includes('fail') || t.includes('error')) return 'error';
  if (
    t.includes('complete') ||
    t.includes('done') ||
    t.includes('stored') ||
    t.includes('ready') ||
    t.includes('success')
  )
    return 'done';
  return 'active';
}

const dotClass: Record<Status, string> = {
  active: 'bg-accent/12 text-accent',
  done: 'bg-success/12 text-success',
  error: 'bg-danger/12 text-danger',
};
const statusIcon: Record<Status, typeof Check> = {
  active: Loader2,
  done: Check,
  error: AlertCircle,
};

function humanize(type: string): string {
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function WorkspaceActivity() {
  const { data, isLoading } = useWorkspaceActivity();
  const items = data?.activity ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Recent Activity
        </h2>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (items.length === 0) return null;

  const groups: { label: string; items: typeof items }[] = [];
  for (const item of items) {
    const label = dayLabel(item.created_at);
    const group = groups[groups.length - 1];
    if (group && group.label === label) group.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">
        Recent Activity
      </h2>
      <div className="overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline">
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div
              className={cn(
                'px-5 py-2.5 text-xs font-medium text-fg-subtle',
                gi > 0 && 'border-t border-line/8',
              )}
            >
              {group.label}
            </div>
            <div className="flex flex-col">
              {group.items.map((item, i) => {
                const status = statusFor(item.type);
                const Icon = statusIcon[status];
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.25 }}
                    className="flex items-center gap-3 border-t border-line/8 px-5 py-3 first:border-t-0"
                  >
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', dotClass[status])}>
                      <Icon className={cn('h-3.5 w-3.5', status === 'active' && 'animate-spin')} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">
                        {item.project_id ? (
                          <Link href={`/projects/${item.project_id}`} className="font-medium hover:text-accent">
                            {item.projectTitle}
                          </Link>
                        ) : (
                          <span className="font-medium">{item.projectTitle}</span>
                        )}{' '}
                        <span className="text-fg-muted">{item.message || humanize(item.type)}</span>
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                      {relativeTime(item.created_at)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
