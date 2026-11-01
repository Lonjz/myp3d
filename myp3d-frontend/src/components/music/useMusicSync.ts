import { useCallback, useEffect, useRef, useState } from 'react';
import { musicApi } from '../../api/musicApi';
import type { MusicDiff, MusicSync } from '../../api/musicApi';
import { usePersistentState } from '../../hooks/usePersistentState';
import { errorMessage } from '../../utils/formatters';
import { useToast } from '../messages/toastContext';
import { useMusicJob } from './useMusicJob';
import type { MusicJobApi } from './useMusicJob';

const SONG_SYNC: MusicJobApi<MusicDiff, MusicSync> = {
  diff: musicApi.diff,
  status: musicApi.syncStatus,
  start: musicApi.startSync,
  dismiss: musicApi.dismiss,
  doneEvent: 'favorites-changed',
  errors: {
    diff: 'Failed to compare with Apple Music',
    start: 'Failed to sync with Apple Music',
    dismiss: 'Failed to close the Apple Music sync',
  },
};

export function useMusicSync() {
  const { showError } = useToast();
  const [folder, setFolder] = usePersistentState('music:folder', '');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { folderRef, setJob, scan, ...job } = useMusicJob(folder, SONG_SYNC);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const status = await musicApi.status(!folderRef.current.trim());
      setAvailable(status.available);
      if (!status.available) return;
      if (!folderRef.current.trim() && status.detected_folder) {
        folderRef.current = status.detected_folder;
        setFolder(status.detected_folder);
      }
      setJob(await musicApi.syncStatus());
      await scan();
    } catch (err) {
      setLoadFailed(true);
      showError(errorMessage(err, 'Failed to check Apple Music'));
    }
  }, [folderRef, scan, setFolder, setJob, showError]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  const retry = () => {
    setLoadFailed(false);
    void load();
  };

  const checkArt = () => scan(musicApi.checkArt, 'Failed to check the covers in Apple Music');

  return { available, loadFailed, retry, folder, setFolder, scan, checkArt, ...job };
}
