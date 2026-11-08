import type { ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../utils/formatters';
import { Spinner } from './Spinner';

interface IconButtonProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  label: string;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  busy?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'default',
  size = 'md',
  active = false,
  busy = false,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('icon-btn', `icon-btn--${variant}`, `icon-btn--${size}`, active && 'is-active', className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
    </button>
  );
}

interface CountButtonProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  count: number;
  label: string;
  title: string;
  busy?: boolean;
}

export function CountButton({ icon: Icon, count, label, busy = false, className, type = 'button', ...props }: CountButtonProps) {
  return (
    <button type={type} className={cx('btn-primary', className)} aria-label={label} {...props}>
      {busy ? <Spinner inline /> : <Icon aria-hidden="true" />}
      {count}
    </button>
  );
}
