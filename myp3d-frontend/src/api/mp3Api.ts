const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface MP3Info {
  filename: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  has_cover: boolean;
  file_size: number;
  date_added?: string | null;
}

export interface DownloadRequest {
  url: string;
  custom_filename?: string;
  title?: string;
  artist?: string;
  album?: string;
  cover_image_base64?: string;
  start_time?: number;
  end_time?: number;
}

export interface YouTubeSearchResult {
  video_id: string;
  url: string;
  title: string;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration: number | null;
}

export interface MetadataUpdate {
  title?: string;
  artist?: string;
  album?: string;
  new_filename?: string;
}

export interface AlbumInfo {
  album_key: string;
  album_name: string;
  track_count: number;
  total_size: number;
  artists: string[];
  has_cover: boolean;
  cover_filename: string | null;
  date_added?: string | null;
}

export interface AlbumDetail {
  album: AlbumInfo;
  tracks: MP3Info[];
}

export interface AlbumUpdateRequest {
  album_name: string;
}

export interface AlbumUpdateResponse {
  success: boolean;
  album_key: string;
  album_name: string;
  updated_tracks: number;
  message: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  returned: number;
}

export interface PaginatedMP3Response {
  items: MP3Info[];
  meta: PaginationMeta;
}

export interface PaginatedAlbumResponse {
  items: AlbumInfo[];
  meta: PaginationMeta;
}

export type MP3FilterBy = 'all' | 'title' | 'artist' | 'filename' | 'album';
export type MP3SortBy = 'date_added' | 'filename' | 'size' | 'artist' | 'title' | 'album';
export type AlbumSortBy = 'album_name' | 'track_count' | 'total_size' | 'date_added';
export type SortDirection = 'asc' | 'desc';

export interface MP3ListPagedParams {
  page: number;
  limit: number;
  search?: string;
  filterBy?: MP3FilterBy;
  sortBy?: MP3SortBy;
  sortDirection?: SortDirection;
}

export interface AlbumListPagedParams {
  page: number;
  limit: number;
  search?: string;
  sortBy?: AlbumSortBy;
  sortDirection?: SortDirection;
}

export const mp3Api = {
  // Download a YouTube video as MP3
  async download(request: DownloadRequest): Promise<{ success: boolean; filename: string; message: string }> {
    const res = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Download failed');
    }
    return res.json();
  },

  // List MP3 files with server-side pagination/filter/sort
  async listAllPaged(params: MP3ListPagedParams): Promise<PaginatedMP3Response> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      search: params.search || '',
      filter_by: params.filterBy || 'all',
      sort_by: params.sortBy || 'date_added',
      sort_direction: params.sortDirection || 'desc',
    });

    const res = await fetch(`${API_BASE}/mp3s/paged?${query.toString()}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to fetch paged MP3 list');
    }
    return res.json();
  },

  // Search YouTube through backend yt-dlp integration
  async searchYouTube(query: string, limit = 12): Promise<YouTubeSearchResult[]> {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
    });
    const res = await fetch(`${API_BASE}/youtube/search?${params.toString()}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to search YouTube');
    }
    const payload = await res.json();
    return payload.results || [];
  },

  // Get MP3 metadata
  async getInfo(filename: string): Promise<MP3Info> {
    const res = await fetch(`${API_BASE}/mp3s/${encodeURIComponent(filename)}/info`);
    if (!res.ok) throw new Error('Failed to fetch MP3 info');
    return res.json();
  },

  // Update metadata
  async updateMetadata(filename: string, metadata: MetadataUpdate): Promise<{ success: boolean; filename: string }> {
    const res = await fetch(`${API_BASE}/mp3s/${encodeURIComponent(filename)}/metadata`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Update failed');
    }
    return res.json();
  },

  // Update cover image
  async updateCover(filename: string, file: File): Promise<{ success: boolean }> {
    const formData = new FormData();
    formData.append('cover', file);
    const res = await fetch(`${API_BASE}/mp3s/${encodeURIComponent(filename)}/cover`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Cover update failed');
    }
    return res.json();
  },

  // Get cover image URL
  getCoverUrl(filename: string): string {
    return `${API_BASE}/mp3s/${encodeURIComponent(filename)}/cover`;
  },

  // Get MP3 file URL (for download/play)
  getFileUrl(filename: string): string {
    return `${API_BASE}/mp3s/${encodeURIComponent(filename)}`;
  },

  // Delete MP3
  async delete(filename: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/mp3s/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Delete failed');
    return res.json();
  },

  // List albums with server-side pagination/filter/sort
  async listAlbumsPaged(params: AlbumListPagedParams): Promise<PaginatedAlbumResponse> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      search: params.search || '',
      sort_by: params.sortBy || 'album_name',
      sort_direction: params.sortDirection || 'asc',
    });

    const res = await fetch(`${API_BASE}/albums/paged?${query.toString()}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to fetch paged album list');
    }
    return res.json();
  },

  // Get album details and tracks
  async getAlbum(albumKey: string): Promise<AlbumDetail> {
    const res = await fetch(`${API_BASE}/albums/${encodeURIComponent(albumKey)}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to fetch album details');
    }
    return res.json();
  },

  // Update album metadata for all tracks in album
  async updateAlbum(albumKey: string, payload: AlbumUpdateRequest): Promise<AlbumUpdateResponse> {
    const res = await fetch(`${API_BASE}/albums/${encodeURIComponent(albumKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Album update failed');
    }
    return res.json();
  },

  // Update album cover for all tracks in album
  async updateAlbumCover(albumKey: string, file: File): Promise<{ success: boolean; updated_tracks: number; message: string }> {
    const formData = new FormData();
    formData.append('cover', file);

    const res = await fetch(`${API_BASE}/albums/${encodeURIComponent(albumKey)}/cover`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || 'Album cover update failed');
    }
    return res.json();
  },

  // Get album cover URL
  getAlbumCoverUrl(albumKey: string): string {
    return `${API_BASE}/albums/${encodeURIComponent(albumKey)}/cover`;
  },
};
