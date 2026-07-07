import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Brand } from '@/components/shell/brand';
import { Button } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/motion';

export function CtaFooter() {
  return (
    <>
      <section className="relative mx-auto max-w-6xl px-4 py-24 lg:px-8">
        <Reveal className="relative overflow-hidden rounded-3xl border border-line/10 bg-surface-1 px-6 py-20 text-center ring-hairline">
          <div className="pointer-events-none absolute inset-0 bg-accent-radial opacity-80" />
          <div className="pointer-events-none absolute inset-0 bg-grain" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-4xl font-semibold tracking-tightest text-fg sm:text-5xl">
              From voiceover to cinematic video, <span className="text-gradient-accent">automatically.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-fg-muted">
              Upload a narration and let the AI studio direct, generate, and render your next film.
            </p>
            <Link href="/create" className="mt-8 inline-block">
              <Button size="lg" className="min-w-48">
                Create Video
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row lg:px-8">
          <Brand href="/" />
          <p className="text-xs text-fg-subtle">
            © {2026} yulia-video — an autonomous AI filmmaking studio.
          </p>
          <div className="flex items-center gap-6 text-xs text-fg-muted">
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
            <Link href="/login" className="hover:text-fg">Sign in</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
