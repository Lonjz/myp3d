import { useMemo } from 'react';
import { DatabaseZap, DiscAlbum, Music } from 'lucide-react';
import { exportApi } from '../../../api/exportApi';
import { mp3Api } from '../../../api/mp3Api';
import { emitAppEvent } from '../../../utils/appEvents';
import { useToast } from '../../messages/toastContext';
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
        {
          id: 'export-tracks',
          title: 'Export all tracks',
          icon: Music,
          keywords: ['zip', 'backup', 'download', 'archive'],
          run: () => exportApi.start(exportApi.tracksUrl()),
        },
        {
          id: 'export-album-art',
          title: 'Export album art',
          icon: DiscAlbum,
          keywords: ['zip', 'covers', 'images', 'artwork', 'archive'],
          run: () => exportApi.start(exportApi.albumArtUrl()),
        },
      ]),
    [showError, showSuccess],
  );
}
