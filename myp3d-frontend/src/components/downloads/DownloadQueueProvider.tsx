import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { queueApi } from '../../api/queueApi';
import type { QueueItem, QueueItemUpdate } from '../../api/queueApi';
import { emitAppEvent, subscribeAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';
import { DownloadQueueContext, isQueueItemActive } from './downloadQueueContext';
import type { DownloadQueueContextValue } from './downloadQueueContext';

const POLL_MS = 1000;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const plural = (count: number) => `${count} track${count === 1 ? '' : 's'}`;

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const { showSuccess, showError } = useToast();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const doneRef = useRef<ReadonlySet<number> | null>(null);
  const runRef = useRef(new Set<number>());

  const apply = useCallback(
    (next: QueueItem[]) => {
      const done = new Set(next.filter((item) => item.status === 'done').map((item) => item.id));
      const previous = doneRef.current;
      doneRef.current = done;
      if (previous && [...done].some((id) => !previous.has(id))) emitAppEvent('library-changed');

      const activeIds = next.filter(isQueueItemActive).map((item) => item.id);
      activeIds.forEach((id) => runRef.current.add(id));
      if (activeIds.length === 0 && runRef.current.size > 0) {
        const run = next.filter((item) => runRef.current.has(item.id));
        runRef.current = new Set();
        const finished = run.filter((item) => item.status === 'done' || item.status === 'failed').length;
        const failed = run.filter((item) => item.status === 'failed').length;
        if (failed > 0) showError(`${failed} of ${plural(finished)} failed to download`);
        else if (finished > 0) showSuccess(`Downloaded ${plural(finished)}`);
      }

      setItems(next);
    },
    [showError, showSuccess],
  );

  const reload = useCallback(async () => {
    try {
      apply(await queueApi.list());
    } catch {
      return;
    }
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => subscribeAppEvent('queue-changed', () => void reload()), [reload]);

  const active = items?.some(isQueueItemActive) ?? false;

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, reload]);

  const run = useCallback(
    async (action: () => Promise<QueueItem[]>, fallbackError: string) => {
      setBusy(true);
      try {
        apply(await action());
        return true;
      } catch (err) {
        showError(errorMessage(err, fallbackError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply, showError],
  );

  const start = useCallback(
    (ids?: number[]) => run(() => queueApi.start(ids), 'Failed to start downloads'),
    [run],
  );

  const stop = useCallback(() => run(queueApi.stop, 'Failed to stop downloads'), [run]);

  const clearDone = useCallback(() => run(queueApi.clearDone, 'Failed to clear downloads'), [run]);

  const remove = useCallback(
    (id: number) =>
      run(async () => {
        await queueApi.remove(id);
        return queueApi.list();
      }, 'Failed to remove download'),
    [run],
  );

  const update = useCallback(
    (id: number, changes: QueueItemUpdate) =>
      run(async () => {
        await queueApi.update(id, changes);
        return queueApi.list();
      }, 'Failed to save download'),
    [run],
  );

  const value = useMemo<DownloadQueueContextValue>(
    () => ({ items, active, busy, start, stop, clearDone, remove, update }),
    [items, active, busy, start, stop, clearDone, remove, update],
  );

  return <DownloadQueueContext.Provider value={value}>{children}</DownloadQueueContext.Provider>;
}
