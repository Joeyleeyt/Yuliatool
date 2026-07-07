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
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-accent-soft">
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 className="text-balance text-3xl font-semibold tracking-tightest text-fg sm:text-4xl">
              {title}
            </h2>
          )}
          {description && <p className="mt-4 text-fg-muted">{description}</p>}
        </Reveal>
      )}
      {children}
    </section>
  );
}
