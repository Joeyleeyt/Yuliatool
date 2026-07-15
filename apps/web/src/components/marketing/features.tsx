import { Wand2, Workflow, Gauge, ShieldCheck, Clapperboard, RefreshCw } from 'lucide-react';
import { Section } from './section';
import { Reveal } from '@/components/ui/motion';
import { IconTile } from '@/components/ui/primitives';

const FEATURES = [
  {
    icon: Wand2,
    title: 'Narrative-driven direction',
    body: 'Scenes are grounded in your actual words and timings — never invented, never off-beat.',
  },
  {
    icon: Clapperboard,
    title: 'Cinematic by default',
    body: 'Ken Burns motion, crossfade transitions, and a soft-luxury grade baked into every render.',
  },
  {
    icon: Workflow,
    title: 'Watch it build, live',
    body: 'A node-by-node pipeline shows exactly what is happening, what is next, and what it costs.',
  },
  {
    icon: RefreshCw,
    title: 'Resumable & idempotent',
    body: 'Crash-safe by construction. Retry any stage without paying twice for a generation.',
  },
  {
    icon: Gauge,
    title: 'Cost, always visible',
    body: 'Per-provider spend rolls up in real time, so a finished film never surprises you.',
  },
  {
    icon: ShieldCheck,
    title: 'Your assets, your storage',
    body: 'Every clip, still, and master lands in your own object storage — metadata stays lean.',
  },
];

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="Why Classy Woman Video"
      title="Built like production infrastructure, felt like magic."
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line/8 bg-line/8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <div className="h-full bg-surface-1 p-7 transition-colors hover:bg-surface-2">
                <IconTile className="mb-4">
                  <Icon className="h-5 w-5" />
                </IconTile>
                <h3 className="text-[15px] font-medium tracking-tight text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
