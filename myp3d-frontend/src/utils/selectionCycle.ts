export interface SelectionCycle<T> {
  selectedCount: number;
  allSelected: boolean;
  label: string;
  next: T[];
}

export function selectionCycle<T>(
  selectable: T[],
  isFresh: (item: T) => boolean,
  isSelected: (item: T) => boolean,
): SelectionCycle<T> {
  const fresh = selectable.filter(isFresh);
  const selectedCount = selectable.filter(isSelected).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const freshSelected =
    fresh.length > 0 && fresh.length < selectable.length && selectedCount === fresh.length && fresh.every(isSelected);

  if (allSelected) return { selectedCount, allSelected, label: 'Select none', next: [] };
  if (freshSelected || fresh.length === 0 || fresh.length === selectable.length) {
    return { selectedCount, allSelected, label: 'Select all, including songs in your library', next: selectable };
  }
  return { selectedCount, allSelected, label: 'Select songs not in your library', next: fresh };
}
