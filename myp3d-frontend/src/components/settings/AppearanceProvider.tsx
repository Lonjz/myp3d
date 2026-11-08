import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { writeStoredValue } from '../../hooks/usePersistentState';
import { backgroundImage } from '../../utils/backgroundImage';
import { useToast } from '../messages/toastContext';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, applyAppearance, readAppearance } from './appearance';
import type { Appearance } from './appearance';
import { AppearanceContext } from './appearanceContext';
import type { AppearanceContextValue } from './appearanceContext';

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { showError } = useToast();
  const [appearance, setAppearance] = useState(readAppearance);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    applyAppearance(appearance);
    writeStoredValue(APPEARANCE_KEY, appearance);
  }, [appearance]);

  const showImage = useCallback((image: Blob | null) => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = image ? URL.createObjectURL(image) : null;
    setImageUrl(imageUrlRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    backgroundImage
      .load()
      .then((image) => {
        if (active && image) showImage(image);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [showImage]);

  const update = useCallback((change: Partial<Appearance>) => {
    setAppearance((current) => ({ ...current, ...change }));
  }, []);

  const setImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        showError('Choose an image file');
        return;
      }
      try {
        await backgroundImage.save(file);
      } catch {
        showError('Failed to save the background image');
        return;
      }
      showImage(file);
    },
    [showError, showImage],
  );

  const removeImage = useCallback(async () => {
    try {
      await backgroundImage.clear();
    } catch {
      showError('Failed to remove the background image');
      return;
    }
    showImage(null);
  }, [showError, showImage]);

  const reset = useCallback(async () => {
    setAppearance(DEFAULT_APPEARANCE);
    await removeImage();
  }, [removeImage]);

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, update, replace: setAppearance, imageUrl, setImage, removeImage, reset }),
    [appearance, update, imageUrl, setImage, removeImage, reset],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
