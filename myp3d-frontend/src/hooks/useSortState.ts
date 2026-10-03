import type { SortDirection } from '../api/mp3Api';
import { usePersistentState } from './usePersistentState';

interface UseSortStateOptions<TSort extends string> {
  initialSortBy: TSort;
  initialDirection: SortDirection;
  getDefaultDirection: (column: TSort) => SortDirection;
  storageKey?: string;
}

export function useSortState<TSort extends string>({
  initialSortBy,
  initialDirection,
  getDefaultDirection,
  storageKey,
}: UseSortStateOptions<TSort>) {
  const [sort, setSort] = usePersistentState<{ sortBy: TSort; sortDirection: SortDirection }>(storageKey ?? null, {
    sortBy: initialSortBy,
    sortDirection: initialDirection,
  });
  const { sortBy, sortDirection } = sort;

  const handleSortClick = (column: TSort) => {
    if (column === sortBy) {
      setSort((prev) => ({ ...prev, sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc' }));
      return;
    }

    setSort({ sortBy: column, sortDirection: getDefaultDirection(column) });
  };

  return { sortBy, sortDirection, handleSortClick };
}
