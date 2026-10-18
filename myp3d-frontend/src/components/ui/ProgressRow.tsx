import type { LucideIcon } from 'lucide-react';

export interface ProgressCounts {
  total: number;
  done: number;
  finished: boolean;
}

export function ProgressRow({ icon: Icon, label, progress }: { icon: LucideIcon; label: string; progress: ProgressCounts }) {
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
