import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Spotlight } from './Spotlight';
import { SpotlightContext } from './spotlightContext';
import type { SpotlightContextValue } from './spotlightContext';
import { librarySource } from './sources/librarySource';
import { pagesSource } from './sources/pagesSource';
import { youtubeSource } from './sources/youtubeSource';
import type { SpotlightSource } from './spotlightTypes';

const BUILT_IN_SOURCES: SpotlightSource[] = [youtubeSource, pagesSource, librarySource];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [registeredSources, setRegisteredSources] = useState<SpotlightSource[]>([]);

  const open = useCallback((query = '') => {
    setInitialQuery(query);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback(() => {
    setInitialQuery('');
    setIsOpen((value) => !value);
  }, []);

  const registerSource = useCallback((source: SpotlightSource) => {
    setRegisteredSources((current) => [...current.filter((entry) => entry.id !== source.id), source]);
    return () => setRegisteredSources((current) => current.filter((entry) => entry !== source));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const key = event.key.toLowerCase();

      if (key === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        toggle();
        return;
      }

      if (
        key === '/' &&
        !isOpen &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        open();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, toggle]);

  const sources = useMemo(() => [...BUILT_IN_SOURCES, ...registeredSources], [registeredSources]);

  const value = useMemo<SpotlightContextValue>(
    () => ({ isOpen, open, close, toggle, registerSource }),
    [isOpen, open, close, toggle, registerSource],
  );

  return (
    <SpotlightContext.Provider value={value}>
      {children}
      <Spotlight open={isOpen} initialQuery={initialQuery} sources={sources} onClose={close} />
    </SpotlightContext.Provider>
  );
}
