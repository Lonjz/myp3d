import { startDownload } from '../utils/download';
import { API_BASE } from './mp3Api';

export const exportApi = {
  tracksUrl(): string {
    return `${API_BASE}/export/tracks.zip`;
  },

  albumArtUrl(): string {
    return `${API_BASE}/export/covers.zip`;
  },

  start(url: string): void {
    startDownload(url);
  },
};
