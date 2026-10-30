import type { AlbumDetail, MP3Info } from '../api/mp3Api';
import { subscribeAppEvent } from './appEvents';

const mp3InfoCache = new Map<string, MP3Info>();
const albumDetailCache = new Map<string, AlbumDetail>();

subscribeAppEvent('library-changed', () => {
  mp3InfoCache.clear();
  albumDetailCache.clear();
});

export function getCachedMp3Info(filename: string): MP3Info | null {
  return mp3InfoCache.get(filename) || null;
}

export function setCachedMp3Info(filename: string, info: MP3Info): void {
  mp3InfoCache.set(filename, info);
}

export function getCachedAlbumDetail(albumKey: string): AlbumDetail | null {
  return albumDetailCache.get(albumKey) || null;
}

export function setCachedAlbumDetail(albumKey: string, detail: AlbumDetail): void {
  albumDetailCache.set(albumKey, detail);
}
