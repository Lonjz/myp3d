import { useCallback, useMemo, useRef, useState } from 'react';
import type { MP3Info } from '../api/mp3Api';

export function useTrackSelection() {
  const [selected, setSelected] = useState<Map<string, MP3Info>>(() => new Map());
  const anchorRef = useRef<number | null>(null);

  const toggle = useCallback((track: MP3Info, index: number, extendRange: boolean, items: MP3Info[]) => {
    const anchor = anchorRef.current;
    anchorRef.current = index;

    setSelected((current) => {
      const shouldSelect = !current.has(track.filename);
      const range = extendRange && anchor !== null && anchor < items.length
        ? items.slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
        : [track];
      const next = new Map(current);
      range.forEach((item) => {
        if (shouldSelect) {
          next.set(item.filename, item);
        } else {
          next.delete(item.filename);
        }
      });
      return next;
    });
  }, []);

  const selectMany = useCallback((tracks: MP3Info[]) => {
    anchorRef.current = null;
    setSelected(new Map(tracks.map((track) => [track.filename, track])));
  }, []);

  const deselect = useCallback((filenames: string[]) => {
    setSelected((current) => {
      if (!filenames.some((filename) => current.has(filename))) return current;
      const next = new Map(current);
      filenames.forEach((filename) => next.delete(filename));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelected((current) => (current.size === 0 ? current : new Map()));
  }, []);

  const tracks = useMemo(() => [...selected.values()], [selected]);
  const filenames = useMemo(() => [...selected.keys()], [selected]);
  const isSelected = useCallback((filename: string) => selected.has(filename), [selected]);

  return { size: selected.size, tracks, filenames, isSelected, toggle, selectMany, deselect, clear };
}
