import { apiFetch, jsonInit } from './mp3Api';
import type { BulkResult, MP3Info } from './mp3Api';

export interface SilentTrack extends MP3Info {
  silence: number;
}

export interface SilenceScan {
  status: 'scanning' | 'done' | 'failed';
  total: number;
  done: number;
  tracks: SilentTrack[];
  error: string | null;
}

export interface NamingTrack extends MP3Info {
  suggested: string | null;
}

export interface ArtistTrack extends MP3Info {
  artists: string[];
  titles: string[];
}

export const healthApi = {
  silence(): Promise<SilenceScan | null> {
    return apiFetch('/health/silence', undefined, 'Failed to load the silence scan');
  },

  scanSilence(): Promise<SilenceScan> {
    return apiFetch('/health/silence/scan', jsonInit('POST', {}), 'Failed to scan for silence');
  },

  trimSilence(filenames: string[]): Promise<BulkResult> {
    return apiFetch('/health/silence/trim', jsonInit('POST', { filenames }), 'Failed to trim the silence');
  },

  naming(): Promise<NamingTrack[]> {
    return apiFetch('/health/naming', undefined, 'Failed to check the file names');
  },

  fixNaming(items: { filename: string; new_name: string }[]): Promise<BulkResult> {
    return apiFetch('/health/naming/fix', jsonInit('POST', { items }), 'Failed to rename the songs');
  },

  artists(): Promise<ArtistTrack[]> {
    return apiFetch('/health/artists', undefined, 'Failed to check the artists');
  },

  fixArtists(items: { filename: string; artist: string }[]): Promise<BulkResult> {
    return apiFetch('/health/artists/fix', jsonInit('POST', { items }), 'Failed to fix the artists');
  },
};
