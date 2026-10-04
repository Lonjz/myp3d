import { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_ACTIVE_STATUSES, syncApi } from '../../api/syncApi';
import type { SyncPeer, SyncSession, SyncStatus } from '../../api/syncApi';
import { emitAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/ToastProvider';

const SESSION_POLL_MS = 1000;
const PEERS_POLL_MS = 2000;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function useSyncSession(port: number | null) {
  const { showError } = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [peers, setPeers] = useState<SyncPeer[]>([]);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (port === null) return undefined;
    let cancelled = false;

    syncApi
      .start(port)
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setStartError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStartError(errorMessage(err, `Couldn't listen on port ${port}`));
      });

    return () => {
      cancelled = true;
      setPeers([]);
      void syncApi.stop().catch(() => undefined);
    };
  }, [port]);

  useEffect(() => {
    let cancelled = false;

    const pollSession = async () => {
      try {
        const next = await syncApi.session();
        if (!cancelled) setSession(next);
      } catch {
        return;
      }
    };

    const pollPeers = async () => {
      try {
        const next = await syncApi.peers();
        if (!cancelled) setPeers(next);
      } catch {
        return;
      }
    };

    void syncApi.device().then((next) => !cancelled && setStatus(next)).catch(() => undefined);
    void pollSession();
    void pollPeers();
    const sessionTimer = window.setInterval(pollSession, SESSION_POLL_MS);
    const peersTimer = window.setInterval(pollPeers, PEERS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(sessionTimer);
      window.clearInterval(peersTimer);
    };
  }, []);

  useEffect(() => {
    if (!session || SYNC_ACTIVE_STATUSES.has(session.status) || session.local.done === 0) return;
    if (refreshedSessionRef.current === session.id) return;
    refreshedSessionRef.current = session.id;
    emitAppEvent('library-changed');
  }, [session]);

  const run = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setBusy(true);
      try {
        await action();
        setSession(await syncApi.session());
      } catch (err) {
        showError(errorMessage(err, fallback));
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  const requestSync = useCallback((peer: SyncPeer) => run(() => syncApi.request(peer.id), 'Sync request failed'), [run]);
  const accept = useCallback(() => run(syncApi.accept, 'Failed to accept sync'), [run]);
  const decline = useCallback(() => run(syncApi.decline, 'Failed to decline sync'), [run]);
  const cancel = useCallback(() => run(syncApi.cancel, 'Failed to cancel sync'), [run]);
  const dismiss = useCallback(() => run(syncApi.dismiss, 'Failed to close sync'), [run]);

  return { status, startError, peers, session, busy, requestSync, accept, decline, cancel, dismiss };
}
