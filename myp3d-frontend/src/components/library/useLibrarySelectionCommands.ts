import { useEffect, useMemo, useRef } from 'react';
import { Download, ListChecks, Pencil, Play, Trash2, X } from 'lucide-react';
import { useSpotlightCommands } from '../spotlight/useSpotlightCommands';
import type { SpotlightCommand } from '../spotlight/spotlightTypes';

interface LibrarySelectionActions {
  selectAll: () => void;
  clear: () => void;
  play: () => void;
  edit: () => void;
  download: () => void;
  remove: () => void;
}

export function useLibrarySelectionCommands(count: number, actions: LibrarySelectionActions): void {
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const commands = useMemo<SpotlightCommand[]>(() => {
    const selectAll: SpotlightCommand = {
      id: 'select-all-tracks',
      title: 'Select all tracks',
      icon: ListChecks,
      keywords: ['selection', 'bulk', 'library'],
      run: () => actionsRef.current.selectAll(),
    };
    if (count === 0) return [selectAll];

    const target = `${count} selected track${count === 1 ? '' : 's'}`;
    return [
      selectAll,
      { id: 'play-selected', title: `Play ${target}`, icon: Play, keywords: ['bulk', 'queue'], run: () => actionsRef.current.play() },
      { id: 'edit-selected', title: `Edit ${target}`, icon: Pencil, keywords: ['bulk', 'artist', 'album', 'cover'], run: () => actionsRef.current.edit() },
      { id: 'download-selected', title: `Download ${target}`, icon: Download, keywords: ['bulk', 'save', 'export'], run: () => actionsRef.current.download() },
      { id: 'delete-selected', title: `Delete ${target}`, icon: Trash2, keywords: ['bulk', 'remove'], run: () => actionsRef.current.remove() },
      { id: 'clear-selection', title: 'Clear selection', icon: X, keywords: ['deselect', 'none'], run: () => actionsRef.current.clear() },
    ];
  }, [count]);

  useSpotlightCommands('library-selection', commands);
}
