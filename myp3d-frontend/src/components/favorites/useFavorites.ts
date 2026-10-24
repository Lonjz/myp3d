import { useCallback, useEffect, useState } from 'react';
import { favoriteApi } from '../../api/favoriteApi';
import { subscribeAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const withFilename = (current: Set<string>, filename: string, on: boolean) => {
  const next = new Set(current);
  if (on) next.add(filename);
  else next.delete(filename);
  return next;
};

export function useFavorites() {
  const { showError } = useToast();
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const load = async () => {
      try {
        setFavorites(new Set(await favoriteApi.list()));
      } catch (err) {
        showError(errorMessage(err, 'Failed to load favourites'));
      }
    };

    void load();
    const unsubscribeFavorites = subscribeAppEvent('favorites-changed', () => void load());
    const unsubscribeLibrary = subscribeAppEvent('library-changed', () => void load());
    return () => {
      unsubscribeFavorites();
      unsubscribeLibrary();
    };
  }, [showError]);

  const toggle = useCallback(
    async (filename: string) => {
      const on = !favorites.has(filename);
      setFavorites((current) => withFilename(current, filename, on));
      try {
        await (on ? favoriteApi.add(filename) : favoriteApi.remove(filename));
      } catch (err) {
        setFavorites((current) => withFilename(current, filename, !on));
        showError(errorMessage(err, on ? 'Failed to favourite' : 'Failed to unfavourite'));
      }
    },
    [favorites, showError],
  );

  return { favorites, toggle };
}
