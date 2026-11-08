import { useCallback, useEffect, useRef, useState } from 'react';
import { favoriteApi } from '../../api/favoriteApi';
import { emitAppEvent, subscribeAppEvents } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';
import { errorMessage } from '../../utils/formatters';

const withFilename = (current: Set<string>, filename: string, on: boolean) => {
  const next = new Set(current);
  if (on) next.add(filename);
  else next.delete(filename);
  return next;
};

export function useFavorites() {
  const { showError } = useToast();
  const [favorites, setFavoritesState] = useState<Set<string>>(() => new Set());
  const favoritesRef = useRef(favorites);

  const setFavorites = useCallback((next: Set<string>) => {
    favoritesRef.current = next;
    setFavoritesState(next);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setFavorites(new Set(await favoriteApi.list()));
      } catch (err) {
        showError(errorMessage(err, 'Failed to load favourites'));
      }
    };

    void load();
    return subscribeAppEvents(['favorites-changed', 'library-changed', 'playlists-changed'], () => void load());
  }, [setFavorites, showError]);

  const toggle = useCallback(
    async (filename: string) => {
      const on = !favoritesRef.current.has(filename);
      setFavorites(withFilename(favoritesRef.current, filename, on));
      try {
        await (on ? favoriteApi.add(filename) : favoriteApi.remove(filename));
        emitAppEvent('playlists-changed');
      } catch (err) {
        setFavorites(withFilename(favoritesRef.current, filename, !on));
        showError(errorMessage(err, on ? 'Failed to favourite' : 'Failed to unfavourite'));
      }
    },
    [setFavorites, showError],
  );

  return { favorites, toggle };
}
