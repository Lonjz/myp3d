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

export type MusicChange =
  | 'title'
  | 'artist'
  | 'album'
  | 'art'
  | 'favorite'
  | 'unfavorite'
  | 'favorite_music'
  | 'unfavorite_music';

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
  without_art: BulkResult['failed'];
  error: string | null;
}

export type MusicPlaylistAction =
  | 'import'
  | 'export'
  | 'pull'
  | 'push'
  | 'link'
  | 'delete_local'
  | 'delete_music'
  | 'in_sync';

export interface MusicPlaylistEntry {
  key: string;
  name: string;
  action: MusicPlaylistAction;
  track_count: number;
  left_out: number;
  playlist_id: string | null;
  has_cover: boolean;
  updated_at: string | null;
}

export interface MusicPlaylistDiff {
  songs_pending: number;
  only_in_music: MusicPlaylistEntry[];
  in_sync: MusicPlaylistEntry[];
  to_sync: MusicPlaylistEntry[];
}

export interface MusicPlaylistSync {
  status: 'syncing' | 'done' | 'failed';
  total: number;
  created: number;
  updated: number;
  deleted: number;
  failed: BulkResult['failed'];
  without_art: BulkResult['failed'];
  error: string | null;
}

export const musicApi = {
  status(detect: boolean): Promise<MusicStatus> {
    return apiFetch(`/music/status?detect=${detect}`, undefined, 'Failed to check Apple Music');
  },

  diff(folder: string): Promise<MusicDiff> {
    return apiFetch('/music/diff', jsonInit('POST', { folder }), 'Failed to compare with Apple Music');
  },

  startSync(folder: string): Promise<MusicSync> {
    return apiFetch('/music/sync', jsonInit('POST', { folder }), 'Failed to sync with Apple Music');
  },

  syncStatus(): Promise<MusicSync | null> {
    return apiFetch('/music/sync', undefined, 'Failed to load the Apple Music sync');
  },

  dismiss(): Promise<{ success: boolean }> {
    return apiFetch('/music/sync/dismiss', jsonInit('POST', {}), 'Failed to close the Apple Music sync');
  },

  playlistDiff(folder: string): Promise<MusicPlaylistDiff> {
    return apiFetch('/music/playlists/diff', jsonInit('POST', { folder }), 'Failed to compare playlists with Apple Music');
  },

  startPlaylistSync(folder: string): Promise<MusicPlaylistSync> {
    return apiFetch('/music/playlists/sync', jsonInit('POST', { folder }), 'Failed to sync playlists with Apple Music');
  },

  playlistSyncStatus(): Promise<MusicPlaylistSync | null> {
    return apiFetch('/music/playlists/sync', undefined, 'Failed to load the playlist sync');
  },

  dismissPlaylistSync(): Promise<{ success: boolean }> {
    return apiFetch('/music/playlists/sync/dismiss', jsonInit('POST', {}), 'Failed to close the playlist sync');
  },
};
