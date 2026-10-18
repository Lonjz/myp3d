import { apiFetch, jsonInit } from './mp3Api';
import type { BulkResult, MP3Info } from './mp3Api';

export interface MusicStatus {
  available: boolean;
  detected_folder: string | null;
}

export interface MusicTrack {
  persistent_id: string;
  name: string;
  artist: string | null;
  album: string | null;
}

export type MusicChange = 'title' | 'artist' | 'album' | 'art';

export interface MusicPair {
  track: MP3Info;
  music: MusicTrack;
  changes: MusicChange[];
}

export interface MusicDiff {
  only_in_music: MusicTrack[];
  both: MusicPair[];
  only_in_library: MP3Info[];
}

export interface MusicSync {
  status: 'syncing' | 'done' | 'failed';
  total: number;
  added: number;
  updated: number;
  failed: BulkResult['failed'];
  without_art: string[];
  error: string | null;
}

export const musicApi = {
  status(detect: boolean): Promise<MusicStatus> {
    return apiFetch(`/music/status?detect=${detect}`, undefined, 'Failed to check Apple Music');
  },

  diff(folder: string): Promise<MusicDiff> {
    return apiFetch('/music/diff', jsonInit('POST', { folder }), 'Failed to compare with Apple Music');
  },

  startSync(filenames: string[], folder: string): Promise<MusicSync> {
    return apiFetch('/music/sync', jsonInit('POST', { filenames, folder }), 'Failed to sync with Apple Music');
  },

  syncStatus(): Promise<MusicSync | null> {
    return apiFetch('/music/sync', undefined, 'Failed to load the Apple Music sync');
  },

  dismiss(): Promise<{ success: boolean }> {
    return apiFetch('/music/sync/dismiss', jsonInit('POST', {}), 'Failed to close the Apple Music sync');
  },
};
