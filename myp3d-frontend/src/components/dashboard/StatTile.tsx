import type { LucideIcon } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  progress?: number;
}

export function StatTile({ label, value, icon: Icon, progress }: StatTileProps) {
  return (
    <div className="stat-tile glass" title={label}>
      <span className="stat-tile__icon" aria-hidden="true">
        <Icon />
      </span>
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
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="stat-tile stat-tile--loading glass" aria-hidden="true">
      <span className="skeleton skeleton--icon" />
      <span className="skeleton skeleton--value" />
      <span className="skeleton skeleton--text-short" />
    </div>
  );
}
