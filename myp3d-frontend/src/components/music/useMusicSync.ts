import { useCallback, useEffect, useRef, useState } from 'react';
import { musicApi } from '../../api/musicApi';
import type { MusicDiff, MusicSync } from '../../api/musicApi';
import { usePersistentState } from '../../hooks/usePersistentState';
import { emitAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';

const SYNC_POLL_MS = 1000;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function useMusicSync() {
  const { showError } = useToast();
  const [folder, setFolder] = usePersistentState('music:folder', '');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [diff, setDiff] = useState<MusicDiff | null>(null);
  const [scanning, setScanning] = useState(false);
  const [job, setJob] = useState<MusicSync | null>(null);
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
      setDiff(await musicApi.diff(target));
    } catch (err) {
      showError(errorMessage(err, 'Failed to compare with Apple Music'));
    } finally {
      setScanning(false);
    }
  }, [showError]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const load = async () => {
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
        showError(errorMessage(err, 'Failed to check Apple Music'));
      }
    };

    void load();
  }, [scan, setFolder, showError]);

  const syncing = job?.status === 'syncing';

  useEffect(() => {
    if (!syncing) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await musicApi.syncStatus();
        if (cancelled) return;
        setJob(next);
        if (next?.status !== 'syncing') emitAppEvent('favorites-changed');
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
      setJob(await musicApi.startSync(folderRef.current.trim()));
    } catch (err) {
      showError(errorMessage(err, 'Failed to sync with Apple Music'));
    } finally {
      setBusy(false);
    }
  }, [showError]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    try {
      await musicApi.dismiss();
      setJob(null);
    } catch (err) {
      showError(errorMessage(err, 'Failed to close the Apple Music sync'));
    } finally {
      setBusy(false);
    }
    await scan();
  }, [scan, showError]);

  return { available, folder, setFolder, diff, scanning, job, busy, scan, startSync, dismiss };
}
