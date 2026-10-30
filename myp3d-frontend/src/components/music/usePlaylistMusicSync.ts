import { useEffect, useRef } from 'react';
import { musicApi } from '../../api/musicApi';
import type { MusicPlaylistDiff, MusicPlaylistSync } from '../../api/musicApi';
import { errorMessage } from '../../utils/formatters';
import { useToast } from '../messages/toastContext';
import { useMusicJob } from './useMusicJob';
import type { MusicJobApi } from './useMusicJob';

const PLAYLIST_SYNC: MusicJobApi<MusicPlaylistDiff, MusicPlaylistSync> = {
  diff: musicApi.playlistDiff,
  status: musicApi.playlistSyncStatus,
  start: musicApi.startPlaylistSync,
  dismiss: musicApi.dismissPlaylistSync,
  doneEvent: 'playlists-changed',
  errors: {
    diff: 'Failed to compare playlists with Apple Music',
    start: 'Failed to sync playlists with Apple Music',
    dismiss: 'Failed to close the playlist sync',
  },
};

export function usePlaylistMusicSync(folder: string, active: boolean) {
  const { showError } = useToast();
  const { folderRef, setJob, scan, ...job } = useMusicJob(folder, PLAYLIST_SYNC);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current || !folderRef.current.trim()) return;
    startedRef.current = true;

    const load = async () => {
      try {
        setJob(await musicApi.playlistSyncStatus());
      } catch (err) {
        showError(errorMessage(err, 'Failed to load the playlist sync'));
      }
      await scan();
    };

    void load();
  }, [active, folder, folderRef, scan, setJob, showError]);

  return { scan, ...job };
}
