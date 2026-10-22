import { useCallback, useEffect, useRef, useState } from 'react';
import { musicApi } from '../../api/musicApi';
import type { MusicPlaylistDiff, MusicPlaylistSync } from '../../api/musicApi';
import { emitAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';

const SYNC_POLL_MS = 1000;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function usePlaylistMusicSync(folder: string, active: boolean) {
  const { showError } = useToast();
  const [diff, setDiff] = useState<MusicPlaylistDiff | null>(null);
  const [scanning, setScanning] = useState(false);
  const [job, setJob] = useState<MusicPlaylistSync | null>(null);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef(folder);
  const startedRef = useRef(false);

  useEffect(() => {
    folderRef.current = folder;
  }, [folder]);

  const scan = useCallback(async () => {
    const target = folderRef.current.trim();
    if (!target) return;
    setScanning(true);
    try {
      setDiff(await musicApi.playlistDiff(target));
    } catch (err) {
      showError(errorMessage(err, 'Failed to compare playlists with Apple Music'));
    } finally {
      setScanning(false);
    }
  }, [showError]);

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
  }, [active, folder, scan, showError]);

  const syncing = job?.status === 'syncing';

  useEffect(() => {
    if (!syncing) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await musicApi.playlistSyncStatus();
        if (cancelled) return;
        setJob(next);
        if (next?.status !== 'syncing') emitAppEvent('playlists-changed');
      } catch {
        return;
      }
    };

    const timer = window.setInterval(poll, SYNC_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [syncing]);

  const startSync = useCallback(async () => {
    setBusy(true);
    try {
      setJob(await musicApi.startPlaylistSync(folderRef.current.trim()));
    } catch (err) {
      showError(errorMessage(err, 'Failed to sync playlists with Apple Music'));
    } finally {
      setBusy(false);
    }
  }, [showError]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    try {
      await musicApi.dismissPlaylistSync();
      setJob(null);
    } catch (err) {
      showError(errorMessage(err, 'Failed to close the playlist sync'));
    } finally {
      setBusy(false);
    }
    await scan();
  }, [scan, showError]);

  return { diff, scanning, job, busy, scan, startSync, dismiss };
}
