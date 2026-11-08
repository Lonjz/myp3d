import { startDownload } from '../utils/download';
import { API_BASE, apiFetch } from './mp3Api';

export interface SystemInfo {
  version: string;
  device_name: string;
}

export const systemApi = {
  info(): Promise<SystemInfo> {
    return apiFetch('/system/info', undefined, 'Failed to load app details');
  },

  downloadBackup(): void {
    startDownload(`${API_BASE}/system/backup.db`);
  },
};
