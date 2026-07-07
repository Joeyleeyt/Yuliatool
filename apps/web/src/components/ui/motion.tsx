'use client';

import * as React from 'react';
import { motion, type Variants, type HTMLMotionProps } from 'framer-motion';

/** Premium easing — matches Tailwind's `ease-premium`. */
export const easePremium = [0.22, 1, 0.36, 1] as const;

/** Fade + rise. The workhorse entrance. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easePremium } },
};

/** Container that staggers its children's entrances. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Soft scale-in for cards / modals. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: easePremium } },
};

/**
 * Reveal — fades a block up when it scrolls into view (once).
 * Use for landing-page sections.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easePremium, delay } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Mounts children with a fade-up entrance (no scroll trigger). */
export function FadeUp({
  children,
  delay = 0,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easePremium, delay } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export { motion };
