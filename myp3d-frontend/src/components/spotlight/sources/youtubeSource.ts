import { Link2, MonitorPlay, Search } from 'lucide-react';
import { getVideoIdFromUrl, getYouTubeThumbnailUrl, isYouTubeUrl } from '../../../utils/youtube';
import type { InstantSpotlightSource } from '../spotlightTypes';

export const youtubeSource: InstantSpotlightSource = {
  id: 'youtube',
  search: (query) => {
    const value = query.trim();
    if (!value) return [];

    if (isYouTubeUrl(value)) {
      const thumbnail = getYouTubeThumbnailUrl(getVideoIdFromUrl(value));
      return [
        {
          id: 'youtube:url',
          section: 'action',
          title: 'Open in Query',
          subtitle: value,
          icon: MonitorPlay,
          thumbnail,
          preview: {
            art: thumbnail,
            wide: true,
            meta: [{ icon: Link2, label: 'URL', value }],
          },
          run: ({ navigate }) => navigate(`/query?url=${encodeURIComponent(value)}`),
        },
      ];
    }

    return [
      {
        id: 'youtube:search',
        section: 'web',
        title: value,
        icon: Search,
        run: ({ navigate }) => navigate(`/query?q=${encodeURIComponent(value)}`),
      },
    ];
  },
};
