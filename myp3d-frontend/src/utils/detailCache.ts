import { mp3Api } from '../api/mp3Api';
import { subscribeAppEvent } from './appEvents';

function cachedFetcher<T>(load: (key: string) => Promise<T>) {
  const cache = new Map<string, T>();
  subscribeAppEvent('library-changed', () => cache.clear());

  return async (key: string, force: boolean): Promise<T> => {
    const cached = force ? undefined : cache.get(key);
    if (cached !== undefined) return cached;
    const value = await load(key);
    cache.set(key, value);
    return value;
  };
}

export const fetchMp3Info = cachedFetcher(mp3Api.getInfo);
export const fetchAlbumDetail = cachedFetcher(mp3Api.getAlbum);
