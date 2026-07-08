'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Section } from './section';
import { IconTile } from '@/components/ui/primitives';
import { PIPELINE_STAGES } from '@/components/pipeline/stages';

export function PipelineShowcase() {
  return (
    <Section
      id="pipeline"
      eyebrow="The AI pipeline"
      title="An autonomous film studio, running end to end."
      description="Every stage is a specialised model handing off to the next — you watch it happen live, node by node."
    >
      <div className="relative overflow-hidden rounded-3xl border border-line/8 bg-surface-1 p-6 shadow-lg ring-hairline lg:p-10">
        <div className="pointer-events-none absolute inset-0 bg-editorial-glow opacity-70" />

        <div className="relative grid gap-3 lg:grid-cols-7">
          {PIPELINE_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="group relative"
              >
                <div className="flex h-full flex-col rounded-2xl border border-line/8 bg-surface-1 p-4 shadow-soft transition-all duration-300 ease-premium hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <IconTile size="sm">
                      <Icon className="h-4 w-4" />
                    </IconTile>
                    <CheckCircle2 className="h-4 w-4 text-success/70" />
                  </div>
                  <p className="text-sm font-medium text-fg">{stage.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
                    {stage.engine}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-fg-muted">{stage.blurb}</p>
                </div>

                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                    <div className="grid h-5 w-5 place-items-center rounded-full border border-line/10 bg-surface-1 shadow-soft">
                      <ArrowRight className="h-3 w-3 text-accent" />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* flowing accent line */}
        <div className="relative mt-8 h-px w-full overflow-hidden rounded-full bg-line/10">
          <motion.div
            className="absolute inset-y-0 w-1/3 bg-accent-line"
            animate={{ x: ['-40%', '340%'] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </div>
    </Section>
  );
}
