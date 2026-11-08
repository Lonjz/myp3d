import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../utils/formatters';

interface ChipProps {
  icon: LucideIcon;
  title: string;
  label?: string;
  className?: string;
  children: ReactNode;
}

export function Chip({ icon: Icon, title, label, className, children }: ChipProps) {
  return (
    <span className={cx('album-chip', className)} title={title} aria-label={label}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}
