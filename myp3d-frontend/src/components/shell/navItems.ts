import { ArrowLeftRight, DiscAlbum, Download, FolderOpen, HeartPulse, LayoutDashboard, Library, ListMusic, MonitorPlay } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppleMusicIcon, SpotifyIcon } from '../ui/BrandIcons';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  keywords: string[];
  detailPrefix?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'stats', 'overview'] },
  { to: '/query', label: 'Query', icon: MonitorPlay, keywords: ['youtube', 'download'] },
  { to: '/spotify', label: 'Spotify', icon: SpotifyIcon, keywords: ['playlist', 'album', 'import', 'match'] },
  { to: '/downloads', label: 'Downloads', icon: Download, keywords: ['queue', 'batch', 'pending'] },
  { to: '/library', label: 'Library', icon: Library, keywords: ['songs', 'tracks', 'music'], detailPrefix: '/details/' },
  { to: '/albums', label: 'Albums', icon: DiscAlbum, keywords: ['records'], detailPrefix: '/albums/' },
  { to: '/playlists', label: 'Playlists', icon: ListMusic, keywords: ['playlist', 'mix', 'collection'], detailPrefix: '/playlists/' },
  { to: '/health', label: 'Health', icon: HeartPulse, keywords: ['silence', 'trim', 'crop', 'fix'] },
  { to: '/export', label: 'Export', icon: FolderOpen, keywords: ['zip', 'backup', 'archive', 'covers'] },
  { to: '/sync', label: 'Sync', icon: ArrowLeftRight, keywords: ['devices', 'network', 'share', 'lan'] },
  { to: '/music', label: 'Apple', icon: AppleMusicIcon, keywords: ['apple music', 'itunes', 'mac', 'import'] },
];

export function isNavItemActive({ to, detailPrefix }: NavItem, pathname: string): boolean {
  return pathname === to || (detailPrefix !== undefined && pathname.startsWith(detailPrefix));
}
