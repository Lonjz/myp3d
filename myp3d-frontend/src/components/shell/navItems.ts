import { DiscAlbum, LayoutDashboard, ListMusic, MonitorPlay } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  isActive: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    keywords: ['home', 'stats', 'overview'],
    isActive: (pathname) => pathname === '/dashboard',
  },
  {
    to: '/query',
    label: 'Query',
    icon: MonitorPlay,
    keywords: ['youtube', 'download'],
    isActive: (pathname) => pathname === '/query',
  },
  {
    to: '/library',
    label: 'Library',
    icon: ListMusic,
    keywords: ['songs', 'tracks', 'music'],
    isActive: (pathname) => pathname === '/library' || pathname.startsWith('/details/'),
  },
  {
    to: '/albums',
    label: 'Albums',
    icon: DiscAlbum,
    keywords: ['records'],
    isActive: (pathname) => pathname === '/albums' || pathname.startsWith('/albums/'),
  },
];
