import { Quote } from 'lucide-react';
import { Section } from './section';
import { Reveal } from '@/components/ui/motion';

const QUOTES = [
  {
    quote:
      "I sent one voiceover and came back to a finished, graded film. I haven't opened an editor in months.",
    name: 'Elena R.',
    role: 'Faceless travel channel · 210K subs',
  },
  {
    quote:
      'The scene planning alone would take my old editor a full day. The studio does it — and the shoot — before I finish my coffee.',
    name: 'Marcus T.',
    role: 'Finance & documentary creator',
  },
  {
    quote:
      "It doesn't feel like generative video. It feels like a director read my script and knew exactly where to point the camera.",
    name: 'Sofia A.',
    role: 'Fashion & editorial studio',
  },
];

export function Testimonials() {
  return (
    <Section
      eyebrow="Trusted by creators"
      title="They stopped editing. The films still ship."
      description="Every quote below is from a channel running entirely on autonomous productions."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {QUOTES.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.08} className="h-full">
            <div className="flex h-full flex-col rounded-2xl border border-line/8 bg-surface-1 p-6 shadow-soft ring-hairline transition-all duration-300 ease-premium hover:-translate-y-1 hover:shadow-lg">
              <Quote className="h-5 w-5 text-accent/60" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-fg-muted">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 border-t border-line/8 pt-4">
                <p className="text-sm font-medium text-fg">{t.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{t.role}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
