import { createContext, useContext } from 'react';
import type { SpotlightSource } from './spotlightTypes';

export interface SpotlightContextValue {
  isOpen: boolean;
  open: (query?: string) => void;
  close: () => void;
  toggle: () => void;
  registerSource: (source: SpotlightSource) => () => void;
}

export const SpotlightContext = createContext<SpotlightContextValue | undefined>(undefined);

export function useSpotlight(): SpotlightContextValue {
  const context = useContext(SpotlightContext);
  if (!context) {
    throw new Error('useSpotlight must be used within a SpotlightProvider');
  }
  return context;
}
