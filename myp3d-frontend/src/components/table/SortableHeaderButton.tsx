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
  const indicator = sortDirection === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      className={`library-sort-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {isActive && <span className="library-sort-indicator" aria-hidden="true">{indicator}</span>}
    </button>
  );
}
