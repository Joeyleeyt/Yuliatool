import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconTile } from '@/components/ui/primitives';
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
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center overflow-hidden rounded-2xl border border-dashed border-line/14 bg-surface-1/60 px-6 py-20 text-center',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-editorial-glow opacity-60" />
      <IconTile size="lg" className="relative mb-5">
        <Icon className="h-6 w-6" />
      </IconTile>
      <h3 className="relative text-lg font-medium tracking-tight text-fg">{title}</h3>
      {description && <div className="relative mt-2 max-w-md text-sm text-fg-muted">{description}</div>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}
