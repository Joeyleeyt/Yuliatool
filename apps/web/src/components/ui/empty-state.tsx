import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-2xl border border-dashed border-line/12 bg-surface-1/50 px-6 py-20 text-center',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-accent-radial opacity-40" />
      <div className="relative mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-accent-soft ring-1 ring-inset ring-line/10">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="relative text-lg font-medium tracking-tight text-fg">{title}</h3>
      {description && <p className="relative mt-2 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}
