import type { CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  MonitorSmartphone,
  MonitorUp,
  Radio,
  X,
} from 'lucide-react';
import type { SyncProgress, SyncSession } from '../api/syncApi';
import { useSyncSession } from '../components/sync/useSyncSession';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePersistentState } from '../hooks/usePersistentState';

const DEFAULT_PORT = '47817';
const MIN_PORT = 1024;
const MAX_PORT = 65535;

const parsePort = (value: string) => {
  const port = Number(value);
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT ? port : null;
};

function ProgressRow({ icon: Icon, label, progress }: { icon: typeof ArrowDown; label: string; progress: SyncProgress }) {
  const ratio = progress.total > 0 ? progress.done / progress.total : progress.finished ? 1 : 0;
  return (
    <div className="sync-progress" title={label}>
      <Icon className="sync-progress__icon" aria-hidden="true" />
      <div
        className="sync-meter"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <span style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      </div>
      <span className="sync-progress__count">
        {progress.done} / {progress.total}
      </span>
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

  const { status, startError, peers, session, busy, requestSync, accept, decline, cancel, dismiss } = useSyncSession(port);
  const listening = status?.port != null && status.port === port && !startError;
  const showSession = session !== null && session.status !== 'incoming';

  return (
    <div className="page sync-page">
      <div className="sync-toolbar glass">
        <span className="album-chip sync-device" title="This device">
          <MonitorSmartphone aria-hidden="true" />
          <span className="album-chip__text">{status?.device.name ?? '…'}</span>
        </span>
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
      </div>

      {showSession ? (
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
                icon={ArrowLeftRight}
                label={`Sync with ${peer.name}`}
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
        icon={ArrowLeftRight}
        title={session ? `Sync with ${session.peer.name}?` : ''}
        cancelLabel="Decline"
        cancelIcon={X}
        confirmLabel="Sync"
        confirmIcon={Check}
        onCancel={() => void decline()}
        onConfirm={() => void accept()}
      />
    </div>
  );
}
