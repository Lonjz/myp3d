import { API_BASE, apiFetch, jsonInit } from './mp3Api';
import type { DownloadRequest } from './mp3Api';

export type QueueStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed';

export interface QueueItem {
  id: number;
  url: string;
  custom_filename: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  has_cover: boolean;
  start_time: number | null;
  end_time: number | null;
  overwrite: boolean;
  status: QueueStatus;
  progress: number | null;
  error: string | null;
  filename: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface QueueItemCreate extends DownloadRequest {
  overwrite?: boolean;
}

export interface QueueItemUpdate {
  url?: string;
  custom_filename?: string;
  title?: string;
  artist?: string;
  album?: string;
  cover_image_base64?: string | null;
  overwrite?: boolean;
}

export const queueApi = {
  list(): Promise<QueueItem[]> {
    return apiFetch('/queue', undefined, 'Failed to load downloads');
  },

  add(items: QueueItemCreate[]): Promise<QueueItem[]> {
    return apiFetch('/queue', jsonInit('POST', { items }), 'Failed to queue download');
  },

  update(id: number, changes: QueueItemUpdate): Promise<QueueItem> {
    return apiFetch(`/queue/${id}`, jsonInit('PATCH', changes), 'Failed to save download');
  },

  remove(id: number): Promise<{ success: boolean }> {
    return apiFetch(`/queue/${id}`, { method: 'DELETE' }, 'Failed to remove download');
  },

  start(ids?: number[]): Promise<QueueItem[]> {
    return apiFetch('/queue/start', jsonInit('POST', { ids }), 'Failed to start downloads');
  },

  stop(): Promise<QueueItem[]> {
    return apiFetch('/queue/stop', jsonInit('POST', {}), 'Failed to stop downloads');
  },

  clearDone(): Promise<QueueItem[]> {
    return apiFetch('/queue/clear', jsonInit('POST', {}), 'Failed to clear downloads');
  },

  getCoverUrl(item: QueueItem): string {
    return `${API_BASE}/queue/${item.id}/cover?v=${encodeURIComponent(item.updated_at)}`;
  },
};
