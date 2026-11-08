import type { InputHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../../utils/formatters';

interface IconFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
  label: string;
  trailing?: ReactNode;
}

export function IconField({ icon: Icon, label, className, placeholder, type = 'text', trailing, ...props }: IconFieldProps) {
  return (
    <label className={cx('icon-field', className)} title={label}>
      <Icon className="icon-field__icon" aria-hidden="true" />
      <input type={type} aria-label={label} placeholder={placeholder ?? label} {...props} />
      {trailing}
    </label>
  );
}
