import { useCallback, useEffect, useState } from 'react';
import { playlistApi } from '../../api/playlistApi';
import type { PlaylistInfo } from '../../api/playlistApi';
import { subscribeAppEvent } from '../../utils/appEvents';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPlaylists(await playlistApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribePlaylists = subscribeAppEvent('playlists-changed', () => void refresh());
    const unsubscribeLibrary = subscribeAppEvent('library-changed', () => void refresh());
    return () => {
      unsubscribePlaylists();
      unsubscribeLibrary();
    };
  }, [refresh]);

  return { playlists, loading, error, refresh };
}
