import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
  progress?: number;
}

export function StatTile({ label, value, icon, detail, progress }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__header">
        <span className="stat-tile__label">{label}</span>
        <span className="stat-tile__icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-tile__value">{value}</div>
      {progress !== undefined && (
        <div
          className="stat-tile__meter"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
        </div>
      )}
      {detail && <div className="stat-tile__detail">{detail}</div>}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="stat-tile stat-tile--loading" aria-hidden="true">
      <span className="skeleton skeleton--text" />
      <span className="skeleton skeleton--value" />
      <span className="skeleton skeleton--text-short" />
    </div>
  );
}
