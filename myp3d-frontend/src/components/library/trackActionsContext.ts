import { createContext, useContext } from 'react';
import type { MouseEvent } from 'react';
import type { MP3Info } from '../../api/mp3Api';
import type { MenuAction } from '../ui/ContextMenu';

export interface TrackActionOptions {
  play: () => void;
  extra?: MenuAction[];
  onDeleted?: (filenames: string[]) => void;
}

export interface TrackActionsContextValue {
  favorites: Set<string>;
  toggleFavorite: (filename: string) => Promise<void>;
  deleting: boolean;
  requestDelete: (filenames: string[], onDeleted?: (filenames: string[]) => void) => void;
  trackActions: (track: MP3Info, options: TrackActionOptions) => MenuAction[];
  openMenu: (event: MouseEvent<HTMLElement>, track: MP3Info, options: TrackActionOptions) => void;
  menuFilename: string | null;
}

export const TrackActionsContext = createContext<TrackActionsContextValue | undefined>(undefined);

export function useTrackActions(): TrackActionsContextValue {
  const context = useContext(TrackActionsContext);
  if (!context) {
    throw new Error('useTrackActions must be used within a TrackActionsProvider');
  }
  return context;
}
