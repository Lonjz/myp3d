import type { ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from './IconButton';
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

export function LoadFailed({ label, onRetry, compact = false }: { label: string; onRetry: () => void; compact?: boolean }) {
  return (
    <EmptyState icon={CircleAlert} label={label} compact={compact}>
      <IconButton icon={RefreshCw} label="Retry" onClick={onRetry} />
    </EmptyState>
  );
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
