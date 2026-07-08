import Link from 'next/link';
import { Check } from 'lucide-react';
import { Section } from './section';
import { Reveal } from '@/components/ui/motion';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    name: 'Creator',
    price: '$29',
    cadence: '/mo',
    blurb: 'For faceless channels finding their voice.',
    features: ['10 rendered films / mo', 'Up to 3 min per film', '1080p exports', 'Community support'],
    cta: 'Start creating',
    featured: false,
  },
  {
    name: 'Studio',
    price: '$99',
    cadence: '/mo',
    blurb: 'For creators shipping on a schedule.',
    features: [
      '50 rendered films / mo',
      'Up to 10 min per film',
      '4K exports',
      'Priority generation queue',
      'Cost & usage analytics',
    ],
    cta: 'Go Studio',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    blurb: 'For teams and agencies at scale.',
    features: ['Unlimited films', 'Bring-your-own storage & keys', 'SSO & audit logs', 'Dedicated support'],
    cta: 'Talk to us',
    featured: false,
  },
];

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Priced like software. Delivers like a studio."
      description="Every plan includes the full autonomous pipeline. Scale up as your channel grows."
    >
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 0.08} className="h-full">
            <div
              className={cn(
                'relative flex h-full flex-col rounded-2xl border p-7 ring-hairline transition-all duration-300 ease-premium hover:-translate-y-1',
                plan.featured
                  ? 'border-accent/40 bg-surface-1 shadow-glow'
                  : 'border-line/8 bg-surface-1 shadow-soft hover:shadow-lg',
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-white">
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-fg">{plan.name}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tightest text-fg">{plan.price}</span>
                <span className="text-sm text-fg-subtle">{plan.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-fg-muted">{plan.blurb}</p>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-fg-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {feat}
                  </li>
                ))}
              </ul>

              <Link href="/create" className="mt-7">
                <Button variant={plan.featured ? 'accent' : 'outline'} className="w-full">
                  {plan.cta}
                </Button>
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
