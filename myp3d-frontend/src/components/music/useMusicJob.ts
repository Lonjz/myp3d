import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoll } from '../../hooks/usePoll';
import { emitAppEvent } from '../../utils/appEvents';
import { errorMessage } from '../../utils/formatters';
import { useToast } from '../messages/toastContext';

const SYNC_POLL_MS = 1000;

export interface MusicJobApi<D, J> {
  diff: (folder: string) => Promise<D>;
  status: () => Promise<J | null>;
  start: (folder: string) => Promise<J>;
  dismiss: () => Promise<unknown>;
  doneEvent: 'favorites-changed' | 'playlists-changed';
  errors: { diff: string; start: string; dismiss: string };
}

export function useMusicJob<D, J extends { status: string }>(folder: string, api: MusicJobApi<D, J>) {
  const { showError } = useToast();
  const [diff, setDiff] = useState<D | null>(null);
  const [scanning, setScanning] = useState(false);
  const [job, setJob] = useState<J | null>(null);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef(folder);

  useEffect(() => {
    folderRef.current = folder;
  }, [folder]);

  const scan = useCallback(async (load: (folder: string) => Promise<D> = api.diff, failure = api.errors.diff) => {
    const target = folderRef.current.trim();
    if (!target) return;
    setScanning(true);
    try {
      setDiff(await load(target));
    } catch (err) {
      showError(errorMessage(err, failure));
    } finally {
      setScanning(false);
    }
  }, [api, showError]);

  usePoll(
    async () => {
      const next = await api.status();
      setJob(next);
      if (next?.status !== 'syncing') emitAppEvent(api.doneEvent);
    },
    SYNC_POLL_MS,
    job?.status === 'syncing',
  );

  const startSync = useCallback(async () => {
    setBusy(true);
    try {
      setJob(await api.start(folderRef.current.trim()));
    } catch (err) {
      showError(errorMessage(err, api.errors.start));
    } finally {
      setBusy(false);
    }
  }, [api, showError]);

  const dismiss = useCallback(async () => {
    setBusy(true);
    try {
      await api.dismiss();
      setJob(null);
    } catch (err) {
      showError(errorMessage(err, api.errors.dismiss));
    } finally {
      setBusy(false);
    }
    await scan();
  }, [api, scan, showError]);

  return { folderRef, diff, scanning, job, setJob, busy, scan, startSync, dismiss };
}
