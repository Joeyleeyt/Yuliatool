import type { LucideIcon } from 'lucide-react';
import { Film, Sparkles, Library, LayoutTemplate, Gauge, Settings } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** True until the dedicated page ships in a later phase. */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Projects', href: '/projects', icon: Film },
  { label: 'Create Video', href: '/create', icon: Sparkles },
  { label: 'Assets', href: '/assets', icon: Library, soon: true },
  { label: 'Templates', href: '/templates', icon: LayoutTemplate, soon: true },
  { label: 'Usage', href: '/usage', icon: Gauge, soon: true },
  { label: 'Settings', href: '/settings', icon: Settings, soon: true },
];
