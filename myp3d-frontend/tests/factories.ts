import type { MP3Info } from '../src/api/mp3Api';
import type { PlaylistInfo } from '../src/api/playlistApi';
import type { QueueItem } from '../src/api/queueApi';

let sequence = 0;
const next = () => ++sequence;

export function resetFactories(): void {
  sequence = 0;
}

export function stamp(daysAgo = 0): string {
  return new Date(Date.UTC(2026, 9, 1) - daysAgo * 86400000).toISOString();
}

export const albumKeyOf = (name: string | null): string =>
  `k${[...(name ?? '').trim().toLowerCase()].map((char) => char.codePointAt(0)!.toString(16)).join('')}`;

export function makeTrack(overrides: Partial<MP3Info> = {}): MP3Info {
  const id = next();
  const title = overrides.title === undefined ? `Song ${id}` : overrides.title;
  const track = {
    filename: `${(title ?? `song ${id}`).toLowerCase()}.mp3`,
    title,
    artist: 'Fleetwood Mac',
    album: 'Rumours',
    has_cover: true,
    file_size: 3_000_000 + id,
    duration: 180 + id,
    date_added: stamp(id),
    ...overrides,
  };
  return { ...track, album_key: overrides.album_key ?? albumKeyOf(track.album) };
}

export function makeTracks(count: number, overrides: Partial<MP3Info> = {}): MP3Info[] {
  return Array.from({ length: count }, () => makeTrack(overrides));
}

export interface PlaylistRecord extends PlaylistInfo {
  filenames: string[];
}

export function makePlaylist(overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  const id = next();
  return {
    id: id.toString(16).padStart(32, '0'),
    name: `Playlist ${id}`,
    description: '',
    track_count: 0,
    has_cover: false,
    is_favorites: false,
    updated_at: stamp(),
    filenames: [],
    ...overrides,
  };
}

export function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const id = next();
  return {
    id,
    url: `https://www.youtube.com/watch?v=video${id.toString().padStart(6, '0')}`,
    custom_filename: null,
    title: `Queued ${id}`,
    artist: null,
    album: null,
    has_cover: false,
    start_time: null,
    end_time: null,
    overwrite: false,
    status: 'pending',
    progress: null,
    error: null,
    filename: null,
    created_at: stamp(),
    updated_at: stamp(),
    finished_at: null,
    ...overrides,
  };
}
