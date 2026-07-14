import { MarketingNav } from '@/components/marketing/marketing-nav';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { PipelineShowcase } from '@/components/marketing/pipeline-showcase';
import { Examples } from '@/components/marketing/examples';
import { Testimonials } from '@/components/marketing/testimonials';
import { Features } from '@/components/marketing/features';
import { Pricing } from '@/components/marketing/pricing';
import { Faq } from '@/components/marketing/faq';
import { CtaFooter } from '@/components/marketing/cta-footer';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg">
      <MarketingNav />
      <main>
        <Hero />
        <HowItWorks />
        <PipelineShowcase />
        <Examples />
        <Testimonials />
        <Features />
        <Pricing />
        <Faq />
        <CtaFooter />
      </main>
    </div>
  );
}
