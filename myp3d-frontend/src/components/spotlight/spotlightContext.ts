import { createStrictContext } from '../../utils/strictContext';
import type { SpotlightSource } from './spotlightTypes';

export interface SpotlightContextValue {
  isOpen: boolean;
  open: (query?: string) => void;
  close: () => void;
  toggle: () => void;
  registerSource: (source: SpotlightSource) => () => void;
}

export const [SpotlightContext, useSpotlight] = createStrictContext<SpotlightContextValue>('useSpotlight');
