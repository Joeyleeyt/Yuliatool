'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { fadeUp, stagger } from '@/components/ui/motion';
import { PIPELINE_STAGES } from '@/components/pipeline/stages';

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-40 lg:px-8">
      {/* ambient cinematic wash */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-accent-radial" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[140px]" />

      <motion.div
        variants={stagger(0.09)}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <motion.div variants={fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-surface-1/60 px-3 py-1 text-xs text-fg-muted backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-accent-soft" />
            Your AI Film Director
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tightest text-fg sm:text-6xl lg:text-7xl"
        >
          Turn any voiceover into a{' '}
          <span className="text-gradient-accent">cinematic YouTube video.</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg text-fg-muted">
          AI automatically writes the scenes, generates the visuals, and renders a finished movie —
          from a single narration track.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/create">
            <Button size="lg" className="min-w-44">
              Create Video
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#pipeline">
            <Button variant="outline" size="lg" className="min-w-44">
              <Play className="h-4 w-4" />
              Watch Demo
            </Button>
          </a>
        </motion.div>

        <motion.p variants={fadeUp} className="mt-5 text-xs text-fg-subtle">
          No editor. No timeline. Upload audio once — watch the studio work.
        </motion.p>
      </motion.div>

      {/* Pipeline ribbon */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto mt-16 max-w-5xl"
      >
        <div className="glass overflow-hidden rounded-2xl border border-line/10 p-4 shadow-lg ring-hairline">
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {PIPELINE_STAGES.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex min-w-[132px] flex-1 items-center gap-2">
                  <div className="flex-1 rounded-xl border border-line/8 bg-surface-1/70 p-3">
                    <motion.div
                      className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-surface-3 text-accent-soft"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.28 }}
                    >
                      <Icon className="h-4 w-4" />
                    </motion.div>
                    <p className="text-xs font-medium text-fg">{stage.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
                      {stage.engine}
                    </p>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-fg-subtle sm:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
