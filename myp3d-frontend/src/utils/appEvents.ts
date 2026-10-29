export interface AppEventMap {
  'library-changed': undefined;
  'playlists-changed': undefined;
  'favorites-changed': undefined;
  'queue-changed': undefined;
  'player-play': undefined;
  'preview-play': undefined;
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
