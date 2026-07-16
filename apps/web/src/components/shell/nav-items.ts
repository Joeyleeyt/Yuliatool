import type { LucideIcon } from 'lucide-react';
import { Film, Sparkles } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** True until the dedicated page ships in a later phase. */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Studio', href: '/projects', icon: Film },
  { label: 'New Film', href: '/create', icon: Sparkles },
];
