'use client';

import Link from 'next/link';
import { Brand } from '@/components/shell/brand';
import { Button } from '@/components/ui/primitives';

const LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Pipeline', href: '#pipeline' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export function MarketingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/8 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-8">
        <Brand href="/" />
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-fg-muted transition-colors hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/create">
            <Button size="sm">Create Video</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
