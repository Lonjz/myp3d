import { CalendarPlus, Clock, DiscAlbum, HardDrive, MicVocal, Music } from 'lucide-react';
import { mp3Api } from '../../../api/mp3Api';
import type { AlbumInfo, MP3Info } from '../../../api/mp3Api';
import { formatBytes, formatDate, formatDuration } from '../../../utils/formatters';
import type { MenuAction } from '../../ui/ContextMenu';
import { SPOTLIGHT_SECTION_LIMIT } from '../spotlightTypes';
import type { RemoteSpotlightSource, SpotlightItem, SpotlightMeta } from '../spotlightTypes';

export interface LibrarySourceActions {
  track: (track: MP3Info) => MenuAction[];
  album: (album: AlbumInfo) => MenuAction[];
}

function compactMeta(entries: Array<SpotlightMeta | null>): SpotlightMeta[] {
  return entries.filter((entry): entry is SpotlightMeta => entry !== null && Boolean(entry.value));
}

function trackItem(track: MP3Info, actions: MenuAction[]): SpotlightItem {
  const hasCover = track.has_cover;
  return {
    id: `track:${track.filename}`,
    section: 'tracks',
    title: track.title || track.filename,
    subtitle: [track.artist, track.album].filter(Boolean).join(' · ') || undefined,
    icon: Music,
    thumbnail: hasCover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined,
    preview: {
      art: hasCover ? mp3Api.getCoverUrl(track.filename, 'medium') : undefined,
      meta: compactMeta([
        { icon: MicVocal, label: 'Artist', value: track.artist || '' },
        { icon: DiscAlbum, label: 'Album', value: track.album || '' },
        track.duration ? { icon: Clock, label: 'Duration', value: formatDuration(Math.round(track.duration)) } : null,
        { icon: HardDrive, label: 'Size', value: formatBytes(track.file_size) },
        track.date_added ? { icon: CalendarPlus, label: 'Added', value: formatDate(track.date_added) } : null,
      ]),
    },
    run: ({ navigate }) => navigate(`/details/${encodeURIComponent(track.filename)}`),
    actions,
  };
}

function albumItem(album: AlbumInfo, actions: MenuAction[]): SpotlightItem {
  const hasCover = album.has_cover;
  return {
    id: `album:${album.album_key}`,
    section: 'albums',
    title: album.album_name,
    subtitle: album.artists.join(', ') || undefined,
    icon: DiscAlbum,
    thumbnail: hasCover ? mp3Api.getAlbumCoverUrl(album.album_key, 'thumb') : undefined,
    preview: {
      art: hasCover ? mp3Api.getAlbumCoverUrl(album.album_key, 'medium') : undefined,
      meta: compactMeta([
        { icon: MicVocal, label: 'Artists', value: album.artists.join(', ') },
        { icon: Music, label: 'Tracks', value: String(album.track_count) },
        { icon: HardDrive, label: 'Size', value: formatBytes(album.total_size) },
        album.date_added ? { icon: CalendarPlus, label: 'Added', value: formatDate(album.date_added) } : null,
      ]),
    },
    run: ({ navigate }) => navigate(`/albums/${encodeURIComponent(album.album_key)}`),
    actions,
  };
}

export function createLibrarySource(getActions: () => LibrarySourceActions): RemoteSpotlightSource {
  return {
    id: 'library',
    remote: true,
    search: async (query, signal) => {
      const { tracks, albums } = await mp3Api.searchLibrary(query, SPOTLIGHT_SECTION_LIMIT, signal);
      const actions = getActions();
      return [
        ...tracks.map((track) => trackItem(track, actions.track(track))),
        ...albums.map((album) => albumItem(album, actions.album(album))),
      ];
    },
  };
}
