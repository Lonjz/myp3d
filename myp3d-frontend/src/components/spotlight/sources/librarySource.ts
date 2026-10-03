import { CalendarPlus, Clock, DiscAlbum, HardDrive, MicVocal, Music } from 'lucide-react';
import { mp3Api } from '../../../api/mp3Api';
import type { AlbumInfo, MP3Info } from '../../../api/mp3Api';
import { formatBytes, formatDate, formatDuration } from '../../../utils/formatters';
import { SPOTLIGHT_SECTION_LIMIT } from '../spotlightTypes';
import type { RemoteSpotlightSource, SpotlightItem, SpotlightMeta } from '../spotlightTypes';

function compactMeta(entries: Array<SpotlightMeta | null>): SpotlightMeta[] {
  return entries.filter((entry): entry is SpotlightMeta => entry !== null && Boolean(entry.value));
}

function trackItem(track: MP3Info): SpotlightItem {
  const cover = track.has_cover ? mp3Api.getCoverUrl(track.filename) : undefined;
  return {
    id: `track:${track.filename}`,
    section: 'tracks',
    title: track.title || track.filename,
    subtitle: [track.artist, track.album].filter(Boolean).join(' · ') || undefined,
    icon: Music,
    thumbnail: cover,
    preview: {
      art: cover,
      meta: compactMeta([
        { icon: MicVocal, label: 'Artist', value: track.artist || '' },
        { icon: DiscAlbum, label: 'Album', value: track.album || '' },
        track.duration ? { icon: Clock, label: 'Length', value: formatDuration(Math.round(track.duration)) } : null,
        { icon: HardDrive, label: 'Size', value: formatBytes(track.file_size) },
        track.date_added ? { icon: CalendarPlus, label: 'Added', value: formatDate(track.date_added) } : null,
      ]),
    },
    run: ({ navigate }) => navigate(`/details/${encodeURIComponent(track.filename)}`),
  };
}

function albumItem(album: AlbumInfo): SpotlightItem {
  const cover = album.has_cover ? mp3Api.getAlbumCoverUrl(album.album_key) : undefined;
  return {
    id: `album:${album.album_key}`,
    section: 'albums',
    title: album.album_name,
    subtitle: album.artists.join(', ') || undefined,
    icon: DiscAlbum,
    thumbnail: cover,
    preview: {
      art: cover,
      meta: compactMeta([
        { icon: MicVocal, label: 'Artists', value: album.artists.join(', ') },
        { icon: Music, label: 'Tracks', value: String(album.track_count) },
        { icon: HardDrive, label: 'Size', value: formatBytes(album.total_size) },
        album.date_added ? { icon: CalendarPlus, label: 'Added', value: formatDate(album.date_added) } : null,
      ]),
    },
    run: ({ navigate }) => navigate(`/albums/${encodeURIComponent(album.album_key)}`),
  };
}

export const librarySource: RemoteSpotlightSource = {
  id: 'library',
  remote: true,
  search: async (query, signal) => {
    const { tracks, albums } = await mp3Api.searchLibrary(query, SPOTLIGHT_SECTION_LIMIT, signal);
    return [...tracks.map(trackItem), ...albums.map(albumItem)];
  },
};
