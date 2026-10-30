import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { isUnreachable } from '../../api/mp3Api';
import { SYNC_ACTIVE_STATUSES, syncApi } from '../../api/syncApi';
import type { SyncDiff, SyncPeer, SyncSession, SyncStatus } from '../../api/syncApi';
import { usePoll } from '../../hooks/usePoll';
import { emitAppEvent } from '../../utils/appEvents';
import { useToast } from '../messages/toastContext';
import { errorMessage } from '../../utils/formatters';

const SESSION_POLL_MS = 1000;
const PEERS_POLL_MS = 2000;

export function useSyncSession(port: number | null) {
  const { showError } = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [startAttempt, setStartAttempt] = useState(0);
  const [peers, setPeers] = useState<SyncPeer[]>([]);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [diffState, setDiffState] = useState<{ sessionId: string; diff: SyncDiff | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
        setStartFailed(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStartFailed(isUnreachable(err));
        setStartError(errorMessage(err, `Couldn't listen on port ${port}`));
      });

    return () => {
      cancelled = true;
      setPeers([]);
      void syncApi.stop().catch(() => undefined);
    };
  }, [port, startAttempt]);

  const pollSession = async () => setSession(await syncApi.session());
  const pollPeers = async () => setPeers(await syncApi.peers());

  const loadInitial = useEffectEvent(() => {
    void syncApi.device().then(setStatus).catch(() => undefined);
    void pollSession().catch(() => undefined);
    void pollPeers().catch(() => undefined);
  });

  useEffect(() => {
    loadInitial();
  }, []);

  usePoll(pollSession, SESSION_POLL_MS);
  usePoll(pollPeers, PEERS_POLL_MS);

  useEffect(() => {
    if (!session || SYNC_ACTIVE_STATUSES.has(session.status) || session.local.done === 0) return;
    if (refreshedSessionRef.current === session.id) return;
    refreshedSessionRef.current = session.id;
    emitAppEvent('library-changed');
    emitAppEvent('playlists-changed');
    emitAppEvent('queue-changed');
  }, [session]);

  const pairedId = session?.status === 'paired' ? session.id : null;
  const diffForSession = diffState !== null && diffState.sessionId === pairedId ? diffState : null;
  const diff = diffForSession?.diff ?? null;
  const diffFailed = diffForSession !== null && diffForSession.diff === null;

  const fetchDiff = useCallback(
    async (sessionId: string) => {
      try {
        const next = await syncApi.diff();
        setDiffState({ sessionId, diff: next });
      } catch (err) {
        setDiffState({ sessionId, diff: null });
        showError(errorMessage(err, 'Failed to compare libraries'));
      }
    },
    [showError],
  );

  useEffect(() => {
    if (pairedId !== null) void fetchDiff(pairedId);
  }, [pairedId, fetchDiff]);

  const refreshDiff = useCallback(async () => {
    if (pairedId === null) return;
    setRefreshing(true);
    try {
      await fetchDiff(pairedId);
    } finally {
      setRefreshing(false);
    }
  }, [pairedId, fetchDiff]);

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
  const start = useCallback(() => run(syncApi.startSync, 'Failed to start sync'), [run]);
  const decline = useCallback(() => run(syncApi.decline, 'Failed to decline sync'), [run]);
  const cancel = useCallback(() => run(syncApi.cancel, 'Failed to cancel sync'), [run]);
  const dismiss = useCallback(() => run(syncApi.dismiss, 'Failed to close sync'), [run]);
  const unpair = useCallback(
    () =>
      run(async () => {
        await syncApi.cancel();
        await syncApi.dismiss();
      }, 'Failed to unpair'),
    [run],
  );

  const diffLoading = pairedId !== null && ((diff === null && !diffFailed) || refreshing);

  return {
    status,
    startError,
    startFailed,
    retryStart: () => setStartAttempt((attempt) => attempt + 1),
    peers,
    session,
    busy,
    diff,
    diffLoading,
    diffFailed,
    refreshDiff,
    requestSync,
    accept,
    start,
    decline,
    cancel,
    dismiss,
    unpair,
  };
}
