import { ArrowLeftRight, DiscAlbum, Download, FolderOpen, HeartPulse, LayoutDashboard, Library, ListMusic, MonitorPlay } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppleMusicIcon, SpotifyIcon } from '../ui/BrandIcons';

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
    to: '/spotify',
    label: 'Spotify',
    icon: SpotifyIcon,
    keywords: ['playlist', 'album', 'import', 'match'],
    isActive: (pathname) => pathname === '/spotify',
  },
  {
    to: '/downloads',
    label: 'Downloads',
    icon: Download,
    keywords: ['queue', 'batch', 'pending'],
    isActive: (pathname) => pathname === '/downloads',
  },
  {
    to: '/library',
    label: 'Library',
    icon: Library,
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
  {
    to: '/playlists',
    label: 'Playlists',
    icon: ListMusic,
    keywords: ['playlist', 'mix', 'collection'],
    isActive: (pathname) => pathname === '/playlists' || pathname.startsWith('/playlists/'),
  },
  {
    to: '/health',
    label: 'Health',
    icon: HeartPulse,
    keywords: ['silence', 'trim', 'crop', 'fix'],
    isActive: (pathname) => pathname === '/health',
  },
  {
    to: '/export',
    label: 'Export',
    icon: FolderOpen,
    keywords: ['zip', 'backup', 'archive', 'covers'],
    isActive: (pathname) => pathname === '/export',
  },
  {
    to: '/sync',
    label: 'Sync',
    icon: ArrowLeftRight,
    keywords: ['devices', 'network', 'share', 'lan'],
    isActive: (pathname) => pathname === '/sync',
  },
  {
    to: '/music',
    label: 'Apple',
    icon: AppleMusicIcon,
    keywords: ['apple music', 'itunes', 'mac', 'import'],
    isActive: (pathname) => pathname === '/music',
  },
];
