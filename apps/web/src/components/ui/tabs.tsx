'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
}
const Ctx = React.createContext<TabsCtx | null>(null);

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <Ctx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1 border-b border-line/8', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('TabsTrigger must be inside Tabs');
  const active = ctx.value === value;
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        'relative px-3.5 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
      )}
    >
      {children}
      {active && (
        <motion.span
          layoutId="tab-underline"
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
    </button>
  );
}

export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('TabsContent must be inside Tabs');
  if (ctx.value !== value) return null;
  return <div className="mt-5">{children}</div>;
}
