import { ArrowDown, ArrowUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SortableHeaderButtonProps {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  sortDirection: 'asc' | 'desc';
  onClick: () => void;
}

export function SortableHeaderButton({
  label,
  icon: Icon,
  isActive,
  sortDirection,
  onClick,
}: SortableHeaderButtonProps) {
  const Indicator = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      className={`library-sort-button ${isActive ? 'active' : ''}`}
      title={label}
      onClick={onClick}
    >
      <Icon className="table-header-icon" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {isActive && <Indicator className="library-sort-indicator" aria-hidden="true" />}
    </button>
  );
}
