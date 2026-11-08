import { useCallback, useEffect, useState } from 'react';
import { playlistApi } from '../../api/playlistApi';
import type { PlaylistInfo } from '../../api/playlistApi';
import { subscribeAppEvents } from '../../utils/appEvents';

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPlaylists(await playlistApi.list());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeAppEvents(['playlists-changed', 'library-changed'], () => void refresh());
  }, [refresh]);

  return { playlists, loading, failed, refresh };
}
