import { Upload, Cpu, Download } from 'lucide-react';
import { Section } from './section';
import { Reveal } from '@/components/ui/motion';

const STEPS = [
  {
    icon: Upload,
    title: 'Upload a voiceover',
    body: 'Drop in a narration track. No script, no storyboard, no timeline to fight.',
  },
  {
    icon: Cpu,
    title: 'The studio directs itself',
    body: 'AI transcribes, analyses the story, plans scenes, and generates every clip and still.',
  },
  {
    icon: Download,
    title: 'Download a finished film',
    body: 'FFmpeg renders a cinematic, YouTube-ready MP4 — crossfades, motion, and voiceover in sync.',
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="Three steps. One of them is yours."
      description="You provide the voice. The AI production studio does everything else."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-line/8 bg-surface-1 p-6 ring-hairline transition-colors hover:border-line/16">
                <div className="mb-5 flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-surface-3 text-accent-soft">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
                </div>
                <h3 className="text-lg font-medium tracking-tight text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
