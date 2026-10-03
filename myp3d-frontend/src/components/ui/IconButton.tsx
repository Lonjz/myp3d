import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'default',
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const classes = ['icon-btn', `icon-btn--${variant}`, `icon-btn--${size}`, active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} aria-label={label} title={label} {...props}>
      <Icon aria-hidden="true" />
    </button>
  );
}
