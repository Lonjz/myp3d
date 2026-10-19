import type { CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Link as LinkIcon,
  MonitorSmartphone,
  MonitorUp,
  Radio,
  Replace,
  ScanSearch,
  X,
} from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import { syncApi } from '../api/syncApi';
import type { SyncDiff, SyncDiffTrack, SyncSession } from '../api/syncApi';
import { Cover, DiffColumn, TrackText } from '../components/diff/DiffColumns';
import { useSyncSession } from '../components/sync/useSyncSession';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { ProgressRow } from '../components/ui/ProgressRow';
import { Spinner } from '../components/ui/Spinner';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePersistentState } from '../hooks/usePersistentState';
import { formatTrackSubtitle } from '../utils/formatters';

const DEFAULT_PORT = '47817';
const MIN_PORT = 1024;
const MAX_PORT = 65535;

const parsePort = (value: string) => {
  const port = Number(value);
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT ? port : null;
};

const localCover = (filename: string) => mp3Api.getCoverUrl(filename, 'thumb');
const peerCover = (filename: string) => syncApi.peerCoverUrl(filename, 'thumb');

function DiffRow({
  track,
  coverUrl,
  replacesLabel,
}: {
  track: SyncDiffTrack;
  coverUrl: (filename: string) => string;
  replacesLabel?: string;
}) {
  const title = track.title || track.filename;
  return (
    <li className="music-row">
      <Cover src={track.has_cover ? coverUrl(track.filename) : undefined} />
      <TrackText title={title} sub={formatTrackSubtitle(track.artist, track.album)} />
      {track.replaces && replacesLabel && (
        <span className="music-changes">
          <span className="music-change" title={replacesLabel} aria-label={replacesLabel}>
            <Replace aria-hidden="true" />
          </span>
        </span>
      )}
    </li>
  );
}

function PairedColumns({ diff, loading, peerName }: { diff: SyncDiff | null; loading: boolean; peerName: string }) {
  if (!diff) {
    return (
      <div className="sync-empty glass">
        <Spinner />
      </div>
    );
  }

  return (
    <div className={`music-columns ${loading ? 'is-scanning' : ''}`.trim()} aria-busy={loading}>
      <DiffColumn icon={ArrowDown} label={`From ${peerName}`} count={diff.incoming.length}>
        {diff.incoming.map((track) => (
          <DiffRow key={track.filename} track={track} coverUrl={peerCover} replacesLabel="Replaces your copy" />
        ))}
      </DiffColumn>
      <DiffColumn icon={Check} label="On both" count={diff.both.length}>
        {diff.both.map((track) => (
          <DiffRow key={track.filename} track={track} coverUrl={localCover} />
        ))}
      </DiffColumn>
      <DiffColumn icon={ArrowUp} label={`To ${peerName}`} count={diff.outgoing.length}>
        {diff.outgoing.map((track) => (
          <DiffRow
            key={track.filename}
            track={track}
            coverUrl={localCover}
            replacesLabel={`Replaces the copy on ${peerName}`}
          />
        ))}
      </DiffColumn>
    </div>
  );
}

function SessionPanel({
  session,
  busy,
  onCancel,
  onDismiss,
}: {
  session: SyncSession;
  busy: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { peer, status, local, remote } = session;

  if (status === 'requested' || status === 'syncing') {
    return (
      <section className="sync-panel glass" aria-live="polite">
        <Spinner />
        <h2 className="sync-panel__title">
          {status === 'requested' ? `Waiting for ${peer.name}` : `Syncing with ${peer.name}`}
        </h2>
        {status === 'syncing' && (
          <div className="sync-panel__progress">
            <ProgressRow icon={ArrowDown} label="Receiving" progress={local} />
            <ProgressRow icon={ArrowUp} label="Sending" progress={remote} />
          </div>
        )}
        <IconButton icon={X} label="Cancel sync" onClick={onCancel} disabled={busy} />
      </section>
    );
  }

  const failed = local.failed + remote.failed;
  const outcome =
    status === 'done'
      ? { icon: CircleCheck, tone: 'success', title: `Synced with ${peer.name}` }
      : status === 'failed'
        ? { icon: CircleAlert, tone: 'warning', title: session.error ?? 'Sync failed' }
        : { icon: CircleX, tone: 'muted', title: session.error ?? (status === 'declined' ? `${peer.name} declined` : 'Sync cancelled') };
  const OutcomeIcon = outcome.icon;

  return (
    <section className="sync-panel glass" aria-live="polite">
      <OutcomeIcon className={`sync-panel__outcome sync-panel__outcome--${outcome.tone}`} aria-hidden="true" />
      <h2 className="sync-panel__title">{outcome.title}</h2>
      {(status === 'done' || local.done > 0 || remote.done > 0) && (
        <div className="album-chips sync-panel__chips">
          <span className="album-chip" title="Received">
            <ArrowDown aria-hidden="true" />
            {local.done}
          </span>
          <span className="album-chip" title="Sent">
            <ArrowUp aria-hidden="true" />
            {remote.done}
          </span>
          {failed > 0 && (
            <span className="album-chip" title="Failed">
              <CircleAlert aria-hidden="true" />
              {failed}
            </span>
          )}
        </div>
      )}
      <button type="button" className="btn-primary" onClick={onDismiss} disabled={busy}>
        <Check aria-hidden="true" />
        Done
      </button>
    </section>
  );
}

export function SyncPage() {
  const [portInput, setPortInput] = usePersistentState('sync:port', DEFAULT_PORT);
  const debouncedPortInput = useDebouncedValue(portInput, 500);
  const port = parsePort(debouncedPortInput);
  const portInvalid = parsePort(portInput) === null;

  const {
    status,
    startError,
    peers,
    session,
    busy,
    diff,
    diffLoading,
    refreshDiff,
    requestSync,
    accept,
    start,
    decline,
    cancel,
    dismiss,
    unpair,
  } = useSyncSession(port);
  const listening = status?.port != null && status.port === port && !startError;
  const paired = session?.status === 'paired' ? session : null;
  const showSession = session !== null && session.status !== 'incoming' && !paired;
  const pending = diff ? diff.incoming.length + diff.outgoing.length : 0;

  return (
    <div className={`page sync-page ${paired ? 'page--fill sync-page--paired' : ''}`.trim()}>
      <div className={`sync-toolbar glass ${paired ? 'is-paired' : ''}`.trim()}>
        <span className="album-chip sync-device" title="This device">
          <MonitorSmartphone aria-hidden="true" />
          <span className="album-chip__text">{status?.device.name ?? '…'}</span>
        </span>
        {paired ? (
          <>
            <LinkIcon className="sync-link" aria-label="Paired" />
            <span className="album-chip sync-device" title="Paired device">
              <MonitorSmartphone aria-hidden="true" />
              <span className="album-chip__text">{paired.peer.name}</span>
            </span>
            <IconButton
              icon={ScanSearch}
              label="Compare again"
              className="sync-toolbar__push"
              onClick={() => void refreshDiff()}
              disabled={busy || diffLoading}
            />
            <IconButton icon={X} label={`Unpair from ${paired.peer.name}`} onClick={() => void unpair()} disabled={busy} />
            <button
              type="button"
              className="btn-primary sync-start"
              onClick={() => void start()}
              disabled={busy || diffLoading || pending === 0}
              title={`Sync with ${paired.peer.name}`}
            >
              <ArrowLeftRight aria-hidden="true" />
              {pending}
            </button>
          </>
        ) : (
          <>
            <IconField
              icon={Radio}
              label="Port"
              type="number"
              inputMode="numeric"
              min={MIN_PORT}
              max={MAX_PORT}
              className={`sync-port ${portInvalid || startError ? 'is-invalid' : ''}`.trim()}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              aria-invalid={portInvalid || Boolean(startError)}
              disabled={showSession}
            />
            <span
              className={`sync-live ${listening ? 'is-on' : ''}`.trim()}
              title={startError ?? (listening ? `Listening on port ${port}` : 'Not listening')}
            >
              <MonitorUp aria-hidden="true" />
            </span>
          </>
        )}
      </div>

      {paired ? (
        <PairedColumns diff={diff} loading={diffLoading} peerName={paired.peer.name} />
      ) : showSession ? (
        <SessionPanel session={session} busy={busy} onCancel={() => void cancel()} onDismiss={() => void dismiss()} />
      ) : peers.length > 0 ? (
        <ul className="sync-peers">
          {peers.map((peer, index) => (
            <li key={peer.id} className="sync-peer glass" style={{ '--row': index } as CSSProperties}>
              <span className="sync-peer__icon" aria-hidden="true">
                <MonitorSmartphone />
              </span>
              <div className="sync-peer__text">
                <span className="sync-peer__name" title={peer.name}>{peer.name}</span>
                <span className="sync-peer__host">{peer.host}</span>
              </div>
              <IconButton
                icon={LinkIcon}
                label={`Pair with ${peer.name}`}
                variant="primary"
                onClick={() => void requestSync(peer)}
                disabled={busy || session?.status === 'incoming'}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="sync-empty glass">
          <span className={`sync-radar ${listening ? 'is-on' : ''}`.trim()} aria-hidden="true">
            <MonitorUp />
          </span>
          <p className="sync-empty__text">
            {startError ?? (portInvalid ? `Port ${MIN_PORT}–${MAX_PORT}` : `Looking for devices on port ${port ?? portInput}`)}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={session?.status === 'incoming'}
        icon={LinkIcon}
        title={session ? `Pair with ${session.peer.name}?` : ''}
        cancelLabel="Decline"
        cancelIcon={X}
        confirmLabel="Pair"
        confirmIcon={Check}
        onCancel={() => void decline()}
        onConfirm={() => void accept()}
      />
    </div>
  );
}
