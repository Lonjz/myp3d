import { useMemo } from 'react';
import { createCommandsSource } from './sources/commandsSource';
import type { SpotlightCommand } from './spotlightTypes';
import { useSpotlightSource } from './useSpotlightSource';

export function useSpotlightCommands(id: string, commands: SpotlightCommand[]): void {
  const source = useMemo(() => createCommandsSource(id, commands), [id, commands]);
  useSpotlightSource(source);
}
