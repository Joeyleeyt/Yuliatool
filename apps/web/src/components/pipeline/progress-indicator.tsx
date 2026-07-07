'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Circular progress ring with a centered percentage. */
export function ProgressIndicator({
  value,
  size = 84,
  stroke = 6,
  tone = 'accent',
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'accent' | 'success' | 'danger';
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const color = { accent: 'rgb(var(--accent))', success: 'rgb(var(--success))', danger: 'rgb(var(--danger))' }[tone];

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('font-mono text-lg font-medium text-fg')}>{Math.round(pct)}%</span>
        {label && <span className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</span>}
      </div>
    </div>
  );
}
