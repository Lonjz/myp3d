import { createContext, useContext } from 'react';
import type { Appearance } from './appearance';

export interface AppearanceContextValue {
  appearance: Appearance;
  update: (change: Partial<Appearance>) => void;
  replace: (appearance: Appearance) => void;
  imageUrl: string | null;
  setImage: (file: File) => Promise<void>;
  removeImage: () => Promise<void>;
  reset: () => Promise<void>;
}

export const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within AppearanceProvider');
  }
  return context;
}
