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
};
