import { ArrowDown, ArrowUp } from 'lucide-react';

interface SortableHeaderButtonProps {
  label: string;
  isActive: boolean;
  sortDirection: 'asc' | 'desc';
  onClick: () => void;
}

export function SortableHeaderButton({
  label,
  isActive,
  sortDirection,
  onClick,
}: SortableHeaderButtonProps) {
  const Indicator = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      className={`library-sort-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {isActive && <Indicator className="library-sort-indicator" aria-hidden="true" />}
    </button>
  );
}
