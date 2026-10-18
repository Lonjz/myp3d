import { Link2 } from 'lucide-react';
import { hasSpotifyLink } from '../../../utils/spotify';
import { SpotifyIcon } from '../../ui/BrandIcons';
import type { InstantSpotlightSource } from '../spotlightTypes';

export const spotifySource: InstantSpotlightSource = {
  id: 'spotify',
  search: (query) => {
    const value = query.trim();
    if (!hasSpotifyLink(value)) return [];

    return [
      {
        id: 'spotify:url',
        section: 'action',
        title: 'Import from Spotify',
        subtitle: value,
        icon: SpotifyIcon,
        preview: {
          meta: [{ icon: Link2, label: 'URL', value }],
        },
        run: ({ navigate }) => navigate(`/spotify?url=${encodeURIComponent(value)}`),
      },
    ];
  },
};
