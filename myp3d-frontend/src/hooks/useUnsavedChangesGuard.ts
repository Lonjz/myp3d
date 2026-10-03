import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import type { BlockerFunction } from 'react-router-dom';

export function useUnsavedChangesGuard(isDirty: boolean) {
  const bypassRef = useRef(false);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (bypassRef.current) {
        bypassRef.current = false;
        return false;
      }
      return isDirty && currentLocation.pathname !== nextLocation.pathname;
    },
    [isDirty],
  );

  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const allowNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return { blocker, allowNavigation };
}
