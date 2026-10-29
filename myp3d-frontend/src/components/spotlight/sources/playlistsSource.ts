import { CalendarClock, ListMusic, Music } from 'lucide-react';
import { playlistApi } from '../../../api/playlistApi';
import type { PlaylistInfo } from '../../../api/playlistApi';
import { formatDate } from '../../../utils/formatters';
import { matchScore } from '../../../utils/matchScore';
import type { MenuAction } from '../../ui/ContextMenu';
import { SPOTLIGHT_SECTION_LIMIT } from '../spotlightTypes';
import type { RemoteSpotlightSource, SpotlightItem } from '../spotlightTypes';

const trackCount = (count: number) => `${count} track${count === 1 ? '' : 's'}`;

function playlistItem(playlist: PlaylistInfo, actions: MenuAction[]): SpotlightItem {
  const hasCover = playlist.has_cover;
  return {
    id: `playlist:${playlist.id}`,
    section: 'playlists',
    title: playlist.name,
    subtitle: trackCount(playlist.track_count),
    icon: ListMusic,
    thumbnail: hasCover ? playlistApi.coverUrl(playlist, 'thumb') : undefined,
    preview: {
      art: hasCover ? playlistApi.coverUrl(playlist, 'medium') : undefined,
      meta: [
        { icon: Music, label: 'Tracks', value: String(playlist.track_count) },
        { icon: CalendarClock, label: 'Updated', value: formatDate(playlist.updated_at) },
      ],
    },
    run: ({ navigate }) => navigate(`/playlists/${encodeURIComponent(playlist.id)}`),
    actions,
  };
}

export function createPlaylistsSource(getActions: () => (playlist: PlaylistInfo) => MenuAction[]): RemoteSpotlightSource {
  return {
    id: 'playlists',
    remote: true,
    search: async (query) => {
      const playlists = await playlistApi.list();
      const actions = getActions();
      return playlists
        .map((playlist) => ({ playlist, score: matchScore(query, [playlist.name, playlist.description]) }))
        .filter((entry): entry is { playlist: PlaylistInfo; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score)
        .slice(0, SPOTLIGHT_SECTION_LIMIT)
        .map(({ playlist }) => playlistItem(playlist, actions(playlist)));
    },
  };
}
