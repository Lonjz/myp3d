import { useMemo } from 'react';
import { DatabaseZap, DiscAlbum, Keyboard, Music, Settings } from 'lucide-react';
import { exportApi } from '../../../api/exportApi';
import { useClearCache } from '../../../hooks/useClearCache';
import { emitAppEvent } from '../../../utils/appEvents';
import { startDownload } from '../../../utils/download';
import { createCommandsSource } from './commandsSource';
import type { InstantSpotlightSource } from '../spotlightTypes';

export function useAppCommandsSource(): InstantSpotlightSource {
  const clearCache = useClearCache();

  return useMemo(
    () =>
      createCommandsSource('app', [
        {
          id: 'clear-cache',
          title: 'Clear cache',
          icon: DatabaseZap,
          keywords: ['refresh', 'reload', 'covers', 'images', 'artwork'],
          run: clearCache,
        },
        {
          id: 'export-tracks',
          title: 'Export all tracks',
          icon: Music,
          keywords: ['zip', 'backup', 'download', 'archive'],
          run: () => startDownload(exportApi.tracksUrl()),
        },
        {
          id: 'export-album-art',
          title: 'Export album art',
          icon: DiscAlbum,
          keywords: ['zip', 'covers', 'images', 'artwork', 'archive'],
          run: () => startDownload(exportApi.albumArtUrl()),
        },
        {
          id: 'shortcuts',
          title: 'Keyboard shortcuts',
          icon: Keyboard,
          keywords: ['keys', 'hotkeys', 'help'],
          run: () => emitAppEvent('show-shortcuts'),
        },
        {
          id: 'settings',
          title: 'Settings',
          icon: Settings,
          keywords: ['preferences', 'theme', 'appearance', 'amoled', 'background', 'accent', 'backup'],
          run: () => emitAppEvent('show-settings'),
        },
      ]),
    [clearCache],
  );
}
