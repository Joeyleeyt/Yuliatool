'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Section } from './section';
import { cn } from '@/lib/utils';

const FAQS = [
  {
    q: 'What do I actually need to provide?',
    a: 'Just a voiceover audio file. No script, storyboard, or editing. The AI reads your narration and directs the entire film from it.',
  },
  {
    q: 'How does it decide what to show on screen?',
    a: 'Your narration is transcribed with word-level timings, analysed for story and tone, then segmented into timed scenes. Each scene gets a cinematic prompt that drives a Veo 3 clip or an editorial still.',
  },
  {
    q: 'How long does a film take to generate?',
    a: 'Most short films finish in a few minutes. You watch every stage progress live — with an ETA and running cost — so nothing is a black box.',
  },
  {
    q: 'Can I regenerate a scene I don’t like?',
    a: 'Yes. Any scene can be regenerated or have its prompt edited, and any failed stage can be retried without re-paying for work that already succeeded.',
  },
  {
    q: 'Where do my videos and assets live?',
    a: 'Every clip, still, and final master is stored in object storage you control. The database only holds lightweight metadata and status.',
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered." className="max-w-3xl">
      <div className="flex flex-col gap-3">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.q}
              className={cn(
                'overflow-hidden rounded-xl border bg-surface-1 ring-hairline transition-colors',
                isOpen ? 'border-line/16' : 'border-line/8',
              )}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[15px] font-medium text-fg">{item.q}</span>
                <Plus
                  className={cn(
                    'h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-300 ease-premium',
                    isOpen && 'rotate-45 text-accent-soft',
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
