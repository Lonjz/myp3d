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

  // List all MP3 files
  async listAll(): Promise<MP3Info[]> {
    const res = await fetch(`${API_BASE}/mp3s`);
    if (!res.ok) throw new Error('Failed to fetch MP3 list');
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

  // List all albums
  async listAlbums(): Promise<AlbumInfo[]> {
    const res = await fetch(`${API_BASE}/albums`);
    if (!res.ok) throw new Error('Failed to fetch album list');
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
