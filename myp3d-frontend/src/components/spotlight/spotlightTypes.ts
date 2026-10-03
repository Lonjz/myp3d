import { Compass, DiscAlbum, MonitorPlay, Music, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';

export type SpotlightSectionId = 'action' | 'pages' | 'tracks' | 'albums' | 'web';

export interface SpotlightSection {
  id: SpotlightSectionId;
  label: string;
  icon: LucideIcon;
}

export const SPOTLIGHT_SECTIONS: SpotlightSection[] = [
  { id: 'action', label: 'Actions', icon: Zap },
  { id: 'pages', label: 'Pages', icon: Compass },
  { id: 'tracks', label: 'Songs', icon: Music },
  { id: 'albums', label: 'Albums', icon: DiscAlbum },
  { id: 'web', label: 'YouTube', icon: MonitorPlay },
];

export const SPOTLIGHT_SECTION_LIMIT = 5;

export interface SpotlightMeta {
  icon: LucideIcon;
  label: string;
  value: string;
}

export interface SpotlightPreview {
  art?: string;
  wide?: boolean;
  meta?: SpotlightMeta[];
}

export interface SpotlightRunContext {
  navigate: NavigateFunction;
  close: () => void;
  query: string;
}

export interface SpotlightItem {
  id: string;
  section: SpotlightSectionId;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  thumbnail?: string;
  preview?: SpotlightPreview;
  run: (context: SpotlightRunContext) => void;
}

export interface InstantSpotlightSource {
  id: string;
  remote?: false;
  search: (query: string) => SpotlightItem[];
}

export interface RemoteSpotlightSource {
  id: string;
  remote: true;
  search: (query: string, signal: AbortSignal) => Promise<SpotlightItem[]>;
}

export type SpotlightSource = InstantSpotlightSource | RemoteSpotlightSource;

export const SPOTLIGHT_SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';
