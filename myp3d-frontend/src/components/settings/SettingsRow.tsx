import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface SettingsRowProps {
  icon: LucideIcon;
  label: string;
  hint?: string;
  children: ReactNode;
}

export function SettingsRow({ icon: Icon, label, hint, children }: SettingsRowProps) {
  return (
    <div className="settings-row" role="group" aria-label={label}>
      <Icon className="settings-row__icon" aria-hidden="true" />
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}
