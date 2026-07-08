import type { ReactNode } from 'react';
import { Reveal } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('relative mx-auto max-w-6xl px-4 py-24 lg:px-8', className)}>
      {(eyebrow || title || description) && (
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          {eyebrow && (
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {eyebrow}
            </span>
          )}
          {title && (
            <h2 className="text-balance text-3xl font-semibold tracking-tightest text-fg sm:text-[2.6rem] sm:leading-[1.1]">
              {title}
            </h2>
          )}
          {description && <p className="mt-4 text-lg text-fg-muted">{description}</p>}
        </Reveal>
      )}
      {children}
    </section>
  );
}
