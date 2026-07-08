'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { DesktopSidebar, SidebarBody } from './sidebar';
import { Topbar } from './topbar';
import { easePremium } from '@/components/ui/motion';

export function StudioShell({
  userEmail,
  children,
}: {
  userEmail?: string | undefined;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-bg">
      {/* ambient editorial wash at the top of the workspace */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-editorial-glow opacity-70" />

      <DesktopSidebar />

      {/* Mobile slide-over */}
      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-fg/25 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line/8 bg-surface-1 shadow-lg lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: easePremium }}
            >
              <button
                onClick={() => setNavOpen(false)}
                className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarBody onNavigate={() => setNavOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        <Topbar userEmail={userEmail} onOpenNav={() => setNavOpen(true)} />
        <main className="relative mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
