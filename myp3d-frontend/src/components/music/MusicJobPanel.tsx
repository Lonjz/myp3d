import type { ReactNode } from 'react';
import { Check, CircleAlert, CircleCheck } from 'lucide-react';
import { AppleMusicIcon } from '../ui/BrandIcons';
import { ProgressRow } from '../ui/ProgressRow';
import { Spinner } from '../ui/Spinner';

interface MusicJobPanelProps {
  status: 'syncing' | 'done' | 'failed';
  error: string | null;
  total: number;
  done: number;
  failed: number;
  busy: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

export function MusicJobPanel({ status, error, total, done, failed, busy, onDismiss, children }: MusicJobPanelProps) {
  if (status === 'syncing') {
    return (
      <section className="sync-panel glass" aria-live="polite">
        <Spinner />
        <div className="sync-panel__progress">
          <ProgressRow icon={AppleMusicIcon} label="Syncing with Apple Music" progress={{ total, done, finished: false }} />
        </div>
      </section>
    );
  }

  const outcomeOk = status === 'done' && failed === 0;
  const OutcomeIcon = outcomeOk ? CircleCheck : CircleAlert;

  return (
    <section className="sync-panel glass" aria-live="polite">
      <OutcomeIcon
        className={`sync-panel__outcome sync-panel__outcome--${outcomeOk ? 'success' : 'warning'}`}
        aria-hidden="true"
      />
      {status === 'failed' && <h2 className="sync-panel__title" title={error ?? ''}>{error ?? 'Sync failed'}</h2>}
      {status === 'done' && <div className="album-chips sync-panel__chips">{children}</div>}
      <button type="button" className="btn-primary" onClick={onDismiss} disabled={busy}>
        <Check aria-hidden="true" />
        Done
      </button>
    </section>
  );
}
