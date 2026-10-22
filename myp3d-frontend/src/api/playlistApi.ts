import { API_BASE, apiFetch, jsonInit } from './mp3Api';
import type { CoverSize, MP3Info } from './mp3Api';

export interface PlaylistInfo {
  id: string;
  name: string;
  description: string;
  track_count: number;
  has_cover: boolean;
  updated_at: string;
}

export interface PlaylistDetail extends PlaylistInfo {
  tracks: MP3Info[];
}

export interface PlaylistUpdate {
  name?: string;
  description?: string;
  filenames?: string[];
}

export const NEW_PLAYLIST_NAME = 'New playlist';

const playlistPath = (id: string) => `/playlists/${encodeURIComponent(id)}`;

export const playlistApi = {
  list(): Promise<PlaylistInfo[]> {
    return apiFetch('/playlists', undefined, 'Failed to load playlists');
  },

  get(id: string): Promise<PlaylistDetail> {
    return apiFetch(playlistPath(id), undefined, 'Failed to load playlist');
  },

  create(name: string, filenames: string[] = []): Promise<PlaylistDetail> {
    return apiFetch('/playlists', jsonInit('POST', { name, filenames }), 'Failed to create playlist');
  },

  update(id: string, payload: PlaylistUpdate): Promise<PlaylistDetail> {
    return apiFetch(playlistPath(id), jsonInit('PUT', payload), 'Failed to save playlist');
  },

  addTracks(id: string, filenames: string[]): Promise<PlaylistInfo> {
    return apiFetch(`${playlistPath(id)}/tracks`, jsonInit('POST', { filenames }), 'Failed to add to playlist');
  },

  updateCover(id: string, file: File): Promise<PlaylistInfo> {
    const formData = new FormData();
    formData.append('cover', file);
    return apiFetch(`${playlistPath(id)}/cover`, { method: 'POST', body: formData }, 'Failed to save cover');
  },

  remove(id: string): Promise<{ success: boolean }> {
    return apiFetch(playlistPath(id), { method: 'DELETE' }, 'Failed to delete playlist');
  },

  coverUrl(playlist: Pick<PlaylistInfo, 'id' | 'updated_at'>, size: CoverSize): string {
    const params = new URLSearchParams({ size, v: playlist.updated_at });
    return `${API_BASE}${playlistPath(playlist.id)}/cover?${params.toString()}`;
  },
};
