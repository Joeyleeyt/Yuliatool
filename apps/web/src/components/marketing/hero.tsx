'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { Button, IconTile } from '@/components/ui/primitives';
import { fadeUp, stagger } from '@/components/ui/motion';
import { PIPELINE_STAGES } from '@/components/pipeline/stages';

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 pt-40 lg:px-8">
      {/* ambient editorial wash — violet ↔ blue */}
      <div className="pointer-events-none absolute inset-0 bg-editorial-glow" />
      <div className="pointer-events-none absolute left-[15%] top-24 h-[380px] w-[560px] rounded-full bg-accent/[0.12] blur-[150px]" />
      <div className="pointer-events-none absolute right-[12%] top-40 h-[320px] w-[480px] rounded-full bg-accent-2/[0.12] blur-[150px]" />

      <motion.div
        variants={stagger(0.09)}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <motion.div variants={fadeUp}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line/10 bg-surface-1/80 px-3.5 py-1.5 text-xs font-medium text-fg-muted shadow-soft backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
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
              New Film
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
        <div className="glass overflow-hidden rounded-2xl border border-line/8 p-4 shadow-lg ring-hairline">
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {PIPELINE_STAGES.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex min-w-[132px] flex-1 items-center gap-2">
                  <div className="flex-1 rounded-xl border border-line/8 bg-surface-1 p-3 shadow-soft">
                    <motion.div
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.28 }}
                    >
                      <IconTile size="sm" className="mb-2.5">
                        <Icon className="h-4 w-4" />
                      </IconTile>
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
