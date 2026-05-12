import type { AlbumDetail, MP3Info } from '../api/mp3Api';

const mp3InfoCache = new Map<string, MP3Info>();
const albumDetailCache = new Map<string, AlbumDetail>();

export function getCachedMp3Info(filename: string): MP3Info | null {
  return mp3InfoCache.get(filename) || null;
}

export function setCachedMp3Info(filename: string, info: MP3Info): void {
  mp3InfoCache.set(filename, info);
}

export function invalidateMp3Info(filename?: string): void {
  if (filename) {
    mp3InfoCache.delete(filename);
    return;
  }
  mp3InfoCache.clear();
}

export function getCachedAlbumDetail(albumKey: string): AlbumDetail | null {
  return albumDetailCache.get(albumKey) || null;
}

export function setCachedAlbumDetail(albumKey: string, detail: AlbumDetail): void {
  albumDetailCache.set(albumKey, detail);
}

export function invalidateAlbumDetail(albumKey?: string): void {
  if (albumKey) {
    albumDetailCache.delete(albumKey);
    return;
  }
  albumDetailCache.clear();
}
