import type { LucideIcon } from 'lucide-react';

interface HeaderIconProps {
  label: string;
  icon: LucideIcon;
}

export function HeaderIcon({ label, icon: Icon }: HeaderIconProps) {
  return (
    <span className="table-header" title={label}>
      <Icon className="table-header-icon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
