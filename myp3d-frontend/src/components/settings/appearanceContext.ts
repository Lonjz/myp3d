import { createStrictContext } from '../../utils/strictContext';
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

export const [AppearanceContext, useAppearance] = createStrictContext<AppearanceContextValue>('useAppearance');
