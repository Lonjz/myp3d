import { createContext, useContext } from 'react';
import type { MP3Info } from '../../api/mp3Api';
import { createStrictContext } from '../../utils/strictContext';
import type { PlayerState } from './playerReducer';

export interface PlayOptions {
  shuffle?: boolean;
}

export type PlaybackState = Omit<PlayerState, 'volume' | 'muted'>;

export interface PlayerContextValue {
  state: PlaybackState;
  currentTrack: MP3Info | null;
  playTracks: (tracks: MP3Info[], startIndex?: number, options?: PlayOptions) => void;
  playAlbum: (albumKey: string, options?: PlayOptions) => Promise<void>;
  playPlaylist: (id: string) => Promise<void>;
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

export interface PlayerVolumeValue {
  volume: number;
  muted: boolean;
}

export const [PlayerContext, usePlayer] = createStrictContext<PlayerContextValue>('usePlayer');
export const PlayerTimeContext = createContext<PlayerTimeValue>({ currentTime: 0, duration: 0 });
export const PlayerVolumeContext = createContext<PlayerVolumeValue>({ volume: 1, muted: false });

export function usePlayerTime(): PlayerTimeValue {
  return useContext(PlayerTimeContext);
}

export function usePlayerVolume(): PlayerVolumeValue {
  return useContext(PlayerVolumeContext);
}
