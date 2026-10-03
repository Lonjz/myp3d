import { useMemo } from 'react';
import { DatabaseZap } from 'lucide-react';
import { mp3Api } from '../../../api/mp3Api';
import { emitAppEvent } from '../../../utils/appEvents';
import { useToast } from '../../messages/ToastProvider';
import { createCommandsSource } from './commandsSource';
import type { InstantSpotlightSource } from '../spotlightTypes';

export function useAppCommandsSource(): InstantSpotlightSource {
  const { showSuccess, showError } = useToast();

  return useMemo(
    () =>
      createCommandsSource('app', [
        {
          id: 'clear-cache',
          title: 'Clear cache',
          icon: DatabaseZap,
          keywords: ['refresh', 'reload', 'covers', 'images', 'artwork'],
          run: async () => {
            try {
              await mp3Api.clearServerCache();
            } catch (err) {
              showError(err instanceof Error ? err.message : 'Failed to clear cache');
              return;
            }
            emitAppEvent('library-changed');
            showSuccess('Cache cleared');
          },
        },
      ]),
    [showError, showSuccess],
  );
}
