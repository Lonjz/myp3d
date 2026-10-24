import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

interface EmptyStateProps {
  icon?: LucideIcon;
  label?: string;
  text?: ReactNode;
  loading?: boolean;
  pulse?: boolean;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  label,
  text,
  loading = false,
  pulse = false,
  compact = false,
  className,
  children,
}: EmptyStateProps) {
  const classes = ['empty-state', compact ? 'empty-state--compact' : 'glass', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role={label ? 'status' : undefined} aria-label={label} title={label}>
      {loading ? (
        <Spinner />
      ) : (
        Icon && (
          <span className={pulse ? 'empty-state__icon is-on' : 'empty-state__icon'} aria-hidden="true">
            <Icon />
          </span>
        )
      )}
      {text && <p className="empty-state__text">{text}</p>}
      {children}
    </div>
  );
}
