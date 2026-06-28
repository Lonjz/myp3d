import { useState } from 'react';
import type { SortDirection } from '../api/mp3Api';

interface UseSortStateOptions<TSort extends string> {
  initialSortBy: TSort;
  initialDirection: SortDirection;
  getDefaultDirection: (column: TSort) => SortDirection;
}

export function useSortState<TSort extends string>({
  initialSortBy,
  initialDirection,
  getDefaultDirection,
}: UseSortStateOptions<TSort>) {
  const [sortBy, setSortBy] = useState<TSort>(initialSortBy);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  const handleSortClick = (column: TSort) => {
    if (column === sortBy) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(getDefaultDirection(column));
  };

  return { sortBy, sortDirection, handleSortClick };
}
