import { useEffect } from 'react';
import { useSpotlight } from './spotlightContext';
import type { SpotlightSource } from './spotlightTypes';

export function useSpotlightSource(source: SpotlightSource | null): void {
  const { registerSource } = useSpotlight();

  useEffect(() => {
    if (!source) return undefined;
    return registerSource(source);
  }, [registerSource, source]);
}
