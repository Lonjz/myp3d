import type { InputHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

interface IconFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: LucideIcon;
  label: string;
}

export function IconField({ icon: Icon, label, className, placeholder, type = 'text', ...props }: IconFieldProps) {
  return (
    <label className={['icon-field', className].filter(Boolean).join(' ')} title={label}>
      <Icon className="icon-field__icon" aria-hidden="true" />
      <input type={type} aria-label={label} placeholder={placeholder ?? label} {...props} />
    </label>
  );
}
