'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// --- Button -----------------------------------------------------------------
const buttonVariants = {
  // High-contrast confidence CTA (Vercel/Linear feel).
  default: 'bg-fg text-bg hover:bg-fg/90 shadow-soft',
  // Violet AI-action.
  accent:
    'bg-accent text-white hover:bg-accent/90 shadow-[0_10px_30px_-12px_rgb(var(--accent)/0.6)]',
  outline: 'border border-line/12 bg-surface-1/40 text-fg hover:bg-surface-2 hover:border-line/20',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  destructive: 'bg-danger/90 text-white hover:bg-danger',
};
const buttonSizes = {
  sm: 'h-8 px-3 text-[13px] rounded-lg',
  md: 'h-10 px-4 text-sm rounded-lg',
  lg: 'h-12 px-6 text-[15px] rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-medium tracking-tight transition-all duration-200 ease-premium',
        'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

// --- Card -------------------------------------------------------------------
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line/8 bg-surface-1 shadow-soft ring-hairline',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-fg', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

// --- Badge ------------------------------------------------------------------
type Tone = 'neutral' | 'violet' | 'emerald' | 'amber' | 'red' | 'green' | 'blue';
const badgeTones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted ring-1 ring-inset ring-line/10',
  violet: 'bg-accent/12 text-accent-soft ring-1 ring-inset ring-accent/25',
  emerald: 'bg-success/12 text-success ring-1 ring-inset ring-success/25',
  amber: 'bg-warning/12 text-warning ring-1 ring-inset ring-warning/25',
  red: 'bg-danger/12 text-danger ring-1 ring-inset ring-danger/25',
  // legacy aliases kept for existing imports
  green: 'bg-success/12 text-success ring-1 ring-inset ring-success/25',
  blue: 'bg-accent/12 text-accent-soft ring-1 ring-inset ring-accent/25',
};

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

// --- Progress ---------------------------------------------------------------
export function Progress({
  value,
  className,
  indeterminate = false,
  tone = 'accent',
}: {
  value?: number;
  className?: string;
  indeterminate?: boolean;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const fill = {
    accent: 'from-accent-soft to-accent',
    success: 'from-success to-emerald-400',
    warning: 'from-warning to-amber-300',
    danger: 'from-danger to-red-400',
  }[tone];
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      {indeterminate ? (
        <div className={cn('absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r', fill, 'animate-shimmer')} />
      ) : (
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-premium', fill)}
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      )}
    </div>
  );
}

// --- Input / Textarea / Label ----------------------------------------------
const fieldBase =
  'w-full rounded-lg border border-line/12 bg-surface-2/60 px-3.5 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-10 py-2', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2.5', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-fg-muted', className)} {...props} />;
}

// --- Skeleton / Spinner -----------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2',
        className,
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-label="loading"
    />
  );
}

// --- Kbd (keyboard-first affordance) ---------------------------------------
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line/12 bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
      {children}
    </kbd>
  );
}
