'use client';

import { DollarSign } from 'lucide-react';
import { useCost } from '@/lib/query/hooks';
import { IconTile } from '@/components/ui/primitives';

const money = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export function CostSummary({ id }: { id: string }) {
  const { data } = useCost(id);
  if (!data || data.totalOperations === 0) return null;

  return (
    <div className="rounded-2xl border border-line/8 bg-surface-1 p-5 shadow-soft ring-hairline">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconTile size="sm">
            <DollarSign className="h-4 w-4" />
          </IconTile>
          <span className="text-sm font-medium text-fg">Generation cost</span>
        </div>
        <span className="font-mono text-lg font-medium text-fg">{money(data.totalUsd)}</span>
      </div>

      <div className="flex flex-col gap-2">
        {data.byProvider.map((p) => {
          const share = data.totalUsd > 0 ? (p.costUsd / data.totalUsd) * 100 : 0;
          return (
            <div key={p.provider} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs capitalize text-fg-muted">{p.provider}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-soft to-accent"
                  style={{ width: `${Math.max(3, share)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-xs text-fg-subtle">
                {money(p.costUsd)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-[11px] text-fg-subtle">
        {data.totalOperations} operations across {data.byProvider.length} providers
      </p>
    </div>
  );
}
