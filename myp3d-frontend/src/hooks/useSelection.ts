import { useCallback, useState } from 'react';

export function useSelection(keys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const chosen = keys.filter((key) => selected.has(key));
  const allChosen = keys.length > 0 && chosen.length === keys.length;

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(keys));

  const drop = (removed: string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      removed.forEach((key) => next.delete(key));
      return next;
    });
  };

  return { keys, selected, chosen, allChosen, toggle, toggleAll, drop };
}

export type Selection = ReturnType<typeof useSelection>;
