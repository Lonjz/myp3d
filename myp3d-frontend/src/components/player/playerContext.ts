import { createContext, useContext } from 'react';
import type { MP3Info } from '../../api/mp3Api';
import type { PlayerState } from './playerReducer';

export interface PlayOptions {
  shuffle?: boolean;
}

export interface PlayerContextValue {
  state: PlayerState;
  currentTrack: MP3Info | null;
  playTracks: (tracks: MP3Info[], startIndex?: number, options?: PlayOptions) => void;
  playAlbum: (albumKey: string, options?: PlayOptions) => Promise<void>;
  playNext: (track: MP3Info) => void;
  enqueue: (tracks: MP3Info[]) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  jumpTo: (index: number) => void;
  remove: (index: number) => void;
  clear: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  trackUpdated: (oldFilename: string, track: MP3Info) => void;
  isCurrent: (filename: string) => boolean;
}

export interface PlayerTimeValue {
  currentTime: number;
  duration: number;
}

export const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);
export const PlayerTimeContext = createContext<PlayerTimeValue>({ currentTime: 0, duration: 0 });

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

export function usePlayerTime(): PlayerTimeValue {
  return useContext(PlayerTimeContext);
}
