import type { LucideIcon } from 'lucide-react';
import { Film, Sparkles, LayoutTemplate, FolderOpen, Palette, Gauge, Settings } from 'lucide-react';

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
  { label: 'Templates', href: '/templates', icon: LayoutTemplate, soon: true },
  { label: 'Assets', href: '/assets', icon: FolderOpen, soon: true },
  { label: 'Brand Kit', href: '/brand-kit', icon: Palette, soon: true },
  { label: 'Usage', href: '/usage', icon: Gauge, soon: true },
  { label: 'Settings', href: '/settings', icon: Settings, soon: true },
];
