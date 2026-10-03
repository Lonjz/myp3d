import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

const STORAGE_PREFIX = 'myp3d:';

export function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStoredValue(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function usePersistentState<T>(key: string | null, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (key ? readStoredValue(key, initial) : initial));

  useEffect(() => {
    if (key) writeStoredValue(key, value);
  }, [key, value]);

  return [value, setValue];
}

export function useStoredValueWriter(key: string, value: unknown, delayMs = 300): void {
  useEffect(() => {
    const timer = window.setTimeout(() => writeStoredValue(key, value), delayMs);
    return () => window.clearTimeout(timer);
  }, [key, value, delayMs]);
}
