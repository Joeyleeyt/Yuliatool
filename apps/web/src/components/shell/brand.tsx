import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The yulia-video wordmark + film-studio glyph. */
export function Brand({ className, href = '/projects' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-2.5', className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent-soft to-accent shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.7)]">
        <Clapperboard className="h-4 w-4 text-white" />
        <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/20" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-fg">
        yulia<span className="text-fg-subtle">·</span>video
      </span>
    </Link>
  );
}
