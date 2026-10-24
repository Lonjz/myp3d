import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  progress?: number;
  to?: string;
  pulse?: boolean;
}

export function StatTile({ label, value, icon: Icon, progress, to, pulse = false }: StatTileProps) {
  const content: ReactNode = (
    <>
      <div className="stat-tile__head">
        <span className={pulse ? 'stat-tile__icon is-on' : 'stat-tile__icon'} aria-hidden="true">
          <Icon />
        </span>
        <span className="stat-tile__label">{label}</span>
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
    </>
  );

  return to ? (
    <Link to={to} className="stat-tile stat-tile--link glass" title={label}>
      {content}
    </Link>
  ) : (
    <div className="stat-tile glass" title={label}>
      {content}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="stat-tile stat-tile--loading glass" aria-hidden="true">
      <div className="stat-tile__head">
        <span className="skeleton skeleton--icon" />
        <span className="skeleton skeleton--label" />
      </div>
      <span className="skeleton skeleton--value" />
    </div>
  );
}
