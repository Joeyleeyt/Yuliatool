'use client';

import { motion } from 'framer-motion';
import { Play, Clock, Film } from 'lucide-react';
import { Section } from './section';

const EXAMPLES = [
  { title: 'Midnight in Monaco', tag: 'Travel · Editorial', duration: '2:14', scenes: 18, format: '16:9' },
  { title: 'The Quiet Fortune', tag: 'Finance · Documentary', duration: '3:41', scenes: 27, format: '16:9' },
  { title: 'Atelier', tag: 'Fashion · Faceless', duration: '1:52', scenes: 15, format: '9:16' },
];

const GRADIENTS = [
  'from-violet-500/30 via-fuchsia-500/10 to-transparent',
  'from-emerald-500/25 via-teal-500/10 to-transparent',
  'from-amber-500/25 via-orange-500/10 to-transparent',
];

export function Examples() {
  return (
    <Section
      eyebrow="Made with Classy Woman Video"
      title="Films that look directed, not generated."
      description="A soft-luxury editorial house style — every render arrives graded, paced, and finished."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {EXAMPLES.map((ex, i) => (
          <motion.div
            key={ex.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="group cursor-pointer overflow-hidden rounded-2xl border border-line/8 bg-surface-1 shadow-soft ring-hairline transition-all duration-300 ease-premium hover:-translate-y-1 hover:border-line/16 hover:shadow-lg"
          >
            <div className={`relative aspect-video overflow-hidden bg-gradient-to-br ${GRADIENTS[i]}`}>
              <div className="absolute inset-0 bg-grain" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/30 backdrop-blur transition-transform duration-300 ease-premium group-hover:scale-110">
                  <Play className="h-5 w-5 translate-x-0.5 text-white" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-white/90 backdrop-blur">
                {ex.format}
              </div>
              <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-white/90 backdrop-blur">
                <Clock className="h-3 w-3" />
                {ex.duration}
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-fg">{ex.title}</p>
                <p className="text-xs text-fg-subtle">{ex.tag}</p>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-fg-subtle">
                <Film className="h-3 w-3" />
                {ex.scenes} scenes
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
