import { useCallback, useEffect, useRef, useState } from 'react';
import { musicApi } from '../../api/musicApi';
import type { MusicAlbumIssue } from '../../api/musicApi';
import { useSelection } from '../../hooks/useSelection';
import { useToast } from '../messages/toastContext';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const albumCount = (count: number) => `${count} album${count === 1 ? '' : 's'}`;

export function useAlbumHealth(active: boolean) {
  const { showSuccess, showError } = useToast();
  const [albums, setAlbums] = useState<MusicAlbumIssue[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const selection = useSelection((albums ?? []).map((album) => album.key));

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      setAlbums(await musicApi.albums());
    } catch (err) {
      showError(errorMessage(err, 'Failed to check the album artists'));
    } finally {
      setScanning(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    void scan();
  }, [active, scan]);

  const fix = async () => {
    const keys = selection.chosen;
    if (keys.length === 0) return;
    setBusy(true);
    try {
      const result = await musicApi.fixAlbums(keys);
      selection.drop(result.updated);
      if (result.failed.length === 0) showSuccess(`Cleared the album artist on ${albumCount(result.updated.length)}`);
      else if (keys.length === 1) showError(`Couldn't clear the album artist: ${result.failed[0].detail}`);
      else showError(`${result.failed.length} of ${albumCount(keys.length)} couldn't be cleared`);
    } catch (err) {
      showError(errorMessage(err, 'Failed to clear the album artists'));
    } finally {
      setBusy(false);
    }
    await scan();
  };

  return { albums, scanning, busy, selection, scan, fix };
}
