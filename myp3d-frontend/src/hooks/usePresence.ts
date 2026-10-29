import { useEffect, useState } from 'react';

export const EXIT_DURATION_MS = 180;

export function usePresence(open: boolean, exitMs = EXIT_DURATION_MS) {
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (open || !mounted) return undefined;
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, mounted, exitMs]);

  return { mounted, closing: mounted && !open };
}

export function useLingering<T>(value: T | null, exitMs = EXIT_DURATION_MS) {
  const [shown, setShown] = useState(value);
  const { mounted, closing } = usePresence(value !== null, exitMs);

  if (value !== null && value !== shown) {
    setShown(value);
  }

  return { value: mounted ? (value ?? shown) : null, closing };
}
