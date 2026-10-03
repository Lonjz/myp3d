import type { MP3Info } from '../api/mp3Api';

export type PlayRequest =
  | { tracks: MP3Info[]; startIndex: number; shuffle?: boolean }
  | { albumKey: string; shuffle?: boolean };

export interface AppEventMap {
  'library-changed': undefined;
  'player-play': undefined;
  'preview-play': undefined;
  'play-request': PlayRequest;
}

type AppEventName = keyof AppEventMap;
type Listener<K extends AppEventName> = (payload: AppEventMap[K]) => void;

const listeners = new Map<AppEventName, Set<(payload: unknown) => void>>();

export function subscribeAppEvent<K extends AppEventName>(name: K, listener: Listener<K>): () => void {
  const set = listeners.get(name) ?? new Set();
  listeners.set(name, set);
  const entry = listener as (payload: unknown) => void;
  set.add(entry);
  return () => {
    set.delete(entry);
  };
}

export function emitAppEvent<K extends AppEventName>(
  name: K,
  ...args: AppEventMap[K] extends undefined ? [] : [AppEventMap[K]]
): void {
  const set = listeners.get(name);
  if (!set) return;
  [...set].forEach((listener) => listener(args[0]));
}
