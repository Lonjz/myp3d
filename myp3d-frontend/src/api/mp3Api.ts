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

interface MetadataUpdate {
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

interface AlbumUpdateRequest {
  album_name: string;
}

interface AlbumUpdateResponse {
  success: boolean;
  album_key: string;
  album_name: string;
  updated_tracks: number;
  message: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  returned: number;
}

interface PaginatedMP3Response {
  items: MP3Info[];
  meta: PaginationMeta;
}

interface PaginatedAlbumResponse {
  items: AlbumInfo[];
  meta: PaginationMeta;
}

export type MP3FilterBy = 'all' | 'title' | 'artist' | 'filename' | 'album';
export type MP3SortBy = 'date_added' | 'filename' | 'size' | 'artist' | 'title' | 'album';
export type AlbumSortBy = 'album_name' | 'track_count' | 'total_size' | 'date_added';
export type SortDirection = 'asc' | 'desc';

interface MP3ListPagedParams {
  page: number;
  limit: number;
  search?: string;
  filterBy?: MP3FilterBy;
  sortBy?: MP3SortBy;
  sortDirection?: SortDirection;
}

interface AlbumListPagedParams {
  page: number;
  limit: number;
  search?: string;
  sortBy?: AlbumSortBy;
  sortDirection?: SortDirection;
}

// Shared fetch wrapper: resolves JSON on success, throws error.detail (or a
// fallback) on failure. Tolerates non-JSON error bodies.
async function apiFetch<T>(path: string, init: RequestInit | undefined, fallbackError: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || fallbackError);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Shared page/limit/search/sort serialization for the paged list endpoints.
function pagedQuery(
  params: { page: number; limit: number; search?: string; sortBy?: string; sortDirection?: string },
  defaults: { sortBy: string; sortDirection: string },
): URLSearchParams {
  return new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search || '',
    sort_by: params.sortBy || defaults.sortBy,
    sort_direction: params.sortDirection || defaults.sortDirection,
  });
}

export const mp3Api = {
  // Download a YouTube video as MP3
  download(request: DownloadRequest): Promise<{ success: boolean; filename: string; message: string }> {
    return apiFetch('/download', jsonInit('POST', request), 'Download failed');
  },

  // List MP3 files with server-side pagination/filter/sort
  listAllPaged(params: MP3ListPagedParams): Promise<PaginatedMP3Response> {
    const query = pagedQuery(params, { sortBy: 'date_added', sortDirection: 'desc' });
    query.set('filter_by', params.filterBy || 'all');
    return apiFetch(`/mp3s/paged?${query.toString()}`, undefined, 'Failed to fetch paged MP3 list');
  },

  // Search YouTube through backend yt-dlp integration
  async searchYouTube(query: string, limit = 12): Promise<YouTubeSearchResult[]> {
    const params = new URLSearchParams({ query, limit: String(limit) });
    const payload = await apiFetch<{ results?: YouTubeSearchResult[] }>(
      `/youtube/search?${params.toString()}`,
      undefined,
      'Failed to search YouTube',
    );
    return payload.results || [];
  },

  // Get MP3 metadata
  getInfo(filename: string): Promise<MP3Info> {
    return apiFetch(`/mp3s/${encodeURIComponent(filename)}/info`, undefined, 'Failed to fetch MP3 info');
  },

  // Update metadata
  updateMetadata(filename: string, metadata: MetadataUpdate): Promise<{ success: boolean; filename: string }> {
    return apiFetch(`/mp3s/${encodeURIComponent(filename)}/metadata`, jsonInit('PUT', metadata), 'Update failed');
  },

  // Update cover image
  updateCover(filename: string, file: File): Promise<{ success: boolean }> {
    const formData = new FormData();
    formData.append('cover', file);
    return apiFetch(
      `/mp3s/${encodeURIComponent(filename)}/cover`,
      { method: 'POST', body: formData },
      'Cover update failed',
    );
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
  delete(filename: string): Promise<{ success: boolean }> {
    return apiFetch(`/mp3s/${encodeURIComponent(filename)}`, { method: 'DELETE' }, 'Delete failed');
  },

  // List albums with server-side pagination/filter/sort
  listAlbumsPaged(params: AlbumListPagedParams): Promise<PaginatedAlbumResponse> {
    const query = pagedQuery(params, { sortBy: 'album_name', sortDirection: 'asc' });
    return apiFetch(`/albums/paged?${query.toString()}`, undefined, 'Failed to fetch paged album list');
  },

  // Get album details and tracks
  getAlbum(albumKey: string): Promise<AlbumDetail> {
    return apiFetch(`/albums/${encodeURIComponent(albumKey)}`, undefined, 'Failed to fetch album details');
  },

  // Update album metadata for all tracks in album
  updateAlbum(albumKey: string, payload: AlbumUpdateRequest): Promise<AlbumUpdateResponse> {
    return apiFetch(`/albums/${encodeURIComponent(albumKey)}`, jsonInit('PUT', payload), 'Album update failed');
  },

  // Update album cover for all tracks in album
  updateAlbumCover(albumKey: string, file: File): Promise<{ success: boolean; updated_tracks: number; message: string }> {
    const formData = new FormData();
    formData.append('cover', file);
    return apiFetch(
      `/albums/${encodeURIComponent(albumKey)}/cover`,
      { method: 'POST', body: formData },
      'Album cover update failed',
    );
  },

  // Get album cover URL
  getAlbumCoverUrl(albumKey: string): string {
    return `${API_BASE}/albums/${encodeURIComponent(albumKey)}/cover`;
  },
};
