import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ApiError } from '../api/mp3Api';

export function useDetail<T>(
  key: string,
  fetchDetail: (key: string, force: boolean) => Promise<T>,
  onLoad: (detail: T) => void,
  onError: (error: unknown) => void,
) {
  const [loaded, setLoaded] = useState<{ key: string; detail: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; missing: boolean } | null>(null);
  const latestKey = useRef(key);

  const load = async (targetKey: string, force: boolean) => {
    latestKey.current = targetKey;
    try {
      const detail = await fetchDetail(targetKey, force);
      if (latestKey.current !== targetKey) return;
      setLoaded({ key: targetKey, detail });
      setFailure(null);
      onLoad(detail);
    } catch (error) {
      if (latestKey.current !== targetKey) return;
      setFailure({ key: targetKey, missing: error instanceof ApiError && error.status === 404 });
      onError(error);
    }
  };

  const loadKey = useEffectEvent((targetKey: string) => {
    void load(targetKey, false);
  });

  useEffect(() => {
    loadKey(key);
  }, [key]);

  return {
    detail: loaded?.detail ?? null,
    current: loaded?.key === key,
    missing: failure?.key === key && failure.missing,
    failed: failure?.key === key && !failure.missing,
    reload: () => load(key, true),
    update: (change: (detail: T) => T) =>
      setLoaded((current) => current && { key: current.key, detail: change(current.detail) }),
  };
}
