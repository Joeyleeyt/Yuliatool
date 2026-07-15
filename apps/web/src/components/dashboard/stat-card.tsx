import type { LucideIcon } from 'lucide-react';
import { IconTile } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * StatCard — an editorial at-a-glance metric tile for the dashboard.
 * White floating card, signature IconTile, large confident figure.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border border-line/8 bg-surface-1 p-4 shadow-soft ring-hairline transition-all duration-300 ease-premium hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
    >
      <IconTile>
        <Icon className="h-5 w-5" />
      </IconTile>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tightest text-fg">
          {value}
        </p>
        {hint && <p className="mt-1 truncate text-xs text-fg-muted">{hint}</p>}
      </div>
    </div>
  );
}
