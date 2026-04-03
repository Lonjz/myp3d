const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface MP3Info {
  filename: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  has_cover: boolean;
  file_size: number;
}

export interface DownloadRequest {
  url: string;
  custom_filename?: string;
  title?: string;
  artist?: string;
  album?: string;
}

export interface MetadataUpdate {
  title?: string;
  artist?: string;
  album?: string;
  new_filename?: string;
}

export interface NormalizeAudioFileResult {
  filename: string;
  status: string;
  original_peak_db?: number;
  applied_gain_db?: number;
  message?: string;
}

export interface NormalizeAudioResponse {
  success: boolean;
  processed: number;
  normalized: number;
  skipped: number;
  failed: number;
  target_peak_db: number;
  results: NormalizeAudioFileResult[];
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

  // Normalize all MP3s using backend default target
  async normalizeAll(): Promise<NormalizeAudioResponse> {
    const res = await fetch(`${API_BASE}/mp3s/normalize-all`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Normalization failed');
    }
    return res.json();
  },
};
