'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button, IconTile } from '@/components/ui/primitives';
import { fadeUp, stagger } from '@/components/ui/motion';

/**
 * Who the studio greets. Fixed rather than derived from the signed-in email:
 * the account local-part ("demo@…" -> "Demo") is a login detail, not the
 * studio owner's name.
 */
const STUDIO_OWNER_NAME = 'Yulia';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function StudioHero() {
  return (
    <motion.div
      variants={stagger(0.08)}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-2xl border border-line/8 bg-surface-1 p-8 shadow-soft ring-hairline sm:p-10"
    >
      <div className="pointer-events-none absolute inset-0 bg-editorial-glow" />
      <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <motion.p variants={fadeUp} className="text-sm font-medium text-fg-muted">
            {greeting()}, {STUDIO_OWNER_NAME}.
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="mt-1.5 text-3xl font-semibold tracking-tightest text-fg sm:text-4xl"
          >
            What are we creating today?
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-base leading-relaxed text-fg-muted">
            Upload one narration. Our AI writes, shoots, edits, and renders your film
            automatically.
          </motion.p>
        </div>

        <motion.div variants={fadeUp} className="flex shrink-0 items-center gap-4">
          <IconTile size="lg" className="hidden sm:grid">
            <Sparkles className="h-6 w-6" />
          </IconTile>
          <Link href="/create">
            <Button variant="accent" size="lg" className="min-w-52">
              Upload Narration
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
