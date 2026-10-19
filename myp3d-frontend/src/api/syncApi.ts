import { API_BASE, apiFetch, jsonInit } from './mp3Api';
import type { CoverSize } from './mp3Api';

export interface SyncDevice {
  id: string;
  name: string;
}

export interface SyncPeer extends SyncDevice {
  host: string;
}

export interface SyncStatus {
  device: SyncDevice;
  port: number | null;
}

export interface SyncProgress {
  total: number;
  done: number;
  failed: number;
  finished: boolean;
}

export type SyncSessionStatus = 'requested' | 'incoming' | 'paired' | 'syncing' | 'done' | 'declined' | 'failed' | 'cancelled';

export interface SyncSession {
  id: string;
  peer: SyncPeer;
  direction: 'outgoing' | 'incoming';
  status: SyncSessionStatus;
  local: SyncProgress;
  remote: SyncProgress;
  error: string | null;
}

export const SYNC_ACTIVE_STATUSES: ReadonlySet<SyncSessionStatus> = new Set(['requested', 'incoming', 'paired', 'syncing']);

export interface SyncDiffTrack {
  filename: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  has_cover: boolean;
  replaces: boolean;
}

export interface SyncDiff {
  incoming: SyncDiffTrack[];
  both: SyncDiffTrack[];
  outgoing: SyncDiffTrack[];
}

const post = <T>(path: string, body: unknown, fallbackError: string) =>
  apiFetch<T>(path, jsonInit('POST', body), fallbackError);

export const syncApi = {
  device(): Promise<SyncStatus> {
    return apiFetch('/sync/device', undefined, 'Failed to load this device');
  },

  start(port: number): Promise<SyncStatus> {
    return post('/sync/start', { port }, `Couldn't listen on port ${port}`);
  },

  stop(): Promise<SyncStatus> {
    return post('/sync/stop', {}, 'Failed to stop sync');
  },

  peers(): Promise<SyncPeer[]> {
    return apiFetch('/sync/peers', undefined, 'Failed to find devices');
  },

  session(): Promise<SyncSession | null> {
    return apiFetch('/sync/session', undefined, 'Failed to load sync status');
  },

  request(peerId: string): Promise<SyncSession> {
    return post('/sync/requests', { peer_id: peerId }, 'Sync request failed');
  },

  accept(): Promise<SyncSession> {
    return post('/sync/session/accept', {}, 'Failed to accept sync');
  },

  diff(): Promise<SyncDiff> {
    return apiFetch('/sync/session/diff', undefined, 'Failed to compare libraries');
  },

  startSync(): Promise<SyncSession> {
    return post('/sync/session/start', {}, 'Failed to start sync');
  },

  peerCoverUrl(filename: string, size?: CoverSize): string {
    const query = size ? `?size=${size}` : '';
    return `${API_BASE}/sync/session/cover/${encodeURIComponent(filename)}${query}`;
  },

  decline(): Promise<{ success: boolean }> {
    return post('/sync/session/decline', {}, 'Failed to decline sync');
  },

  cancel(): Promise<{ success: boolean }> {
    return post('/sync/session/cancel', {}, 'Failed to cancel sync');
  },

  dismiss(): Promise<{ success: boolean }> {
    return post('/sync/session/dismiss', {}, 'Failed to close sync');
  },
};
