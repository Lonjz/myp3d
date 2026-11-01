import { http, HttpResponse } from 'msw';
import type { JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { API_BASE } from '../src/api/mp3Api';
import type { AlbumInfo, LibraryStats, MP3Info, TagSuggestion, YouTubeSearchResult } from '../src/api/mp3Api';
import type { PlaylistDetail, PlaylistInfo } from '../src/api/playlistApi';
import type { QueueItem } from '../src/api/queueApi';
import type { ArtistTrack, NamingTrack, SilentTrack } from '../src/api/healthApi';
import { albumKeyOf, makePlaylist, makeQueueItem, stamp } from './factories';
import type { PlaylistRecord } from './factories';

type Params = Record<string, string>;
type Resolver = (context: { params: Params; url: URL; body: unknown; request: Request }) => Response | JsonBodyType | Promise<Response | JsonBodyType>;

export interface LoggedRequest {
  method: string;
  path: string;
  body: unknown;
}

interface Hold {
  method: string;
  path: string;
  promise: Promise<void>;
  release: () => void;
}

interface Store {
  tracks: MP3Info[];
  favorites: string[];
  playlists: PlaylistRecord[];
  queue: QueueItem[];
  youtube: YouTubeSearchResult[];
  songs: TagSuggestion[];
  silent: SilentTrack[];
  naming: NamingTrack[];
  artists: ArtistTrack[];
}

const emptyStore = (): Store => ({ tracks: [], favorites: [], playlists: [], queue: [], youtube: [], songs: [], silent: [], naming: [], artists: [] });

let store = emptyStore();
let isDown = false;
let holds: Hold[] = [];
let failures: Array<{ method: string; path: string; status: number; detail: string }> = [];
const requests: LoggedRequest[] = [];
const unhandled: string[] = [];


const error = (status: number, detail: string) => HttpResponse.json({ detail }, { status });
const findTrack = (filename: string) => store.tracks.find((track) => track.filename === filename);
const blank = (value: string | null | undefined) => !(value ?? '').trim();
const names = (field: 'artist' | 'album') => [...new Set(store.tracks.map((track) => track[field]).filter((value): value is string => !blank(value)))].sort();

function bulk(filenames: string[], apply: (track: MP3Info) => void) {
  const updated: string[] = [];
  const failed: Array<{ filename: string; detail: string }> = [];
  for (const filename of filenames) {
    const track = findTrack(filename);
    if (!track) {
      failed.push({ filename, detail: 'MP3 file not found' });
      continue;
    }
    apply(track);
    updated.push(filename);
  }
  return { success: failed.length === 0, updated, failed };
}

function filtered(url: URL): MP3Info[] {
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const filterBy = url.searchParams.get('filter_by') ?? 'all';
  const sortBy = url.searchParams.get('sort_by') ?? 'date_added';
  const direction = url.searchParams.get('sort_direction') ?? 'desc';
  const issue = url.searchParams.get('issue') ?? 'any';
  let tracks = [...store.tracks];
  if (url.searchParams.get('favorites') === 'true') tracks = tracks.filter((track) => store.favorites.includes(track.filename));
  if (issue === 'title' || issue === 'artist' || issue === 'album') tracks = tracks.filter((track) => blank(track[issue]));
  if (issue === 'cover') tracks = tracks.filter((track) => !track.has_cover);
  if (search) {
    const fields = filterBy === 'all' ? (['title', 'artist', 'album', 'filename'] as const) : ([filterBy] as Array<'title'>);
    tracks = tracks.filter((track) => fields.some((field) => (track[field] ?? '').toLowerCase().includes(search)));
  }
  const key = (sortBy === 'size' ? 'file_size' : sortBy) as keyof MP3Info;
  tracks.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }));
  return direction === 'desc' ? tracks.reverse() : tracks;
}

function albums(): AlbumInfo[] {
  const groups = new Map<string, AlbumInfo>();
  for (const track of store.tracks) {
    const key = albumKeyOf(track.album);
    const album = groups.get(key) ?? {
      album_key: key,
      album_name: track.album?.trim() || '(No Album)',
      track_count: 0,
      total_size: 0,
      artists: [],
      has_cover: false,
      cover_filename: null,
      date_added: track.date_added ?? null,
    };
    album.track_count += 1;
    album.total_size += track.file_size;
    if (track.artist && !album.artists.includes(track.artist)) album.artists.push(track.artist);
    if (track.has_cover && !album.has_cover) {
      album.has_cover = true;
      album.cover_filename = track.filename;
    }
    groups.set(key, album);
  }
  return [...groups.values()].sort((a, b) => a.album_name.localeCompare(b.album_name));
}

function paged<T>(items: T[], url: URL) {
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 25);
  const slice = items.slice((page - 1) * limit, page * limit);
  return { items: slice, meta: { total: items.length, page, limit, total_pages: Math.max(1, Math.ceil(items.length / limit)), returned: slice.length } };
}

function playlistInfo(playlist: PlaylistRecord): PlaylistInfo {
  const names = new Set(store.tracks.map((track) => track.filename));
  const { filenames, ...info } = playlist;
  return { ...info, track_count: filenames.filter((filename) => names.has(filename)).length };
}

function playlistDetail(playlist: PlaylistRecord): PlaylistDetail {
  return { ...playlistInfo(playlist), tracks: playlist.filenames.map(findTrack).filter((track): track is MP3Info => Boolean(track)) };
}

function findPlaylist(id: string) {
  return store.playlists.find((playlist) => playlist.id === id);
}

function stats(): LibraryStats {
  const artists = new Map<string, number>();
  store.tracks.forEach((track) => track.artist && artists.set(track.artist, (artists.get(track.artist) ?? 0) + 1));
  const total = store.tracks.reduce((sum, track) => sum + track.file_size, 0);
  const duration = store.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const count = store.tracks.length;
  return {
    total_tracks: count,
    total_albums: albums().filter((album) => album.album_name !== '(No Album)').length,
    total_artists: artists.size,
    total_size: total,
    total_duration: duration,
    total_favorites: store.favorites.length,
    average_size: count ? total / count : 0,
    average_duration: count ? duration / count : 0,
    tracks_with_cover: store.tracks.filter((track) => track.has_cover).length,
    health: {
      missing_title: store.tracks.filter((track) => blank(track.title)).length,
      missing_artist: store.tracks.filter((track) => blank(track.artist)).length,
      missing_album: store.tracks.filter((track) => blank(track.album)).length,
      missing_cover: store.tracks.filter((track) => !track.has_cover).length,
      duplicates: 0,
      unlisted: 0,
    },
    top_artists: [...artists].map(([name, track_count]) => ({ name, track_count })).sort((a, b) => b.track_count - a.track_count),
    top_albums: albums().map(({ album_key, album_name, track_count, total_size, has_cover }) => ({ album_key, album_name, track_count, total_size, has_cover })),
    additions_by_month: [{ month: '2026-10', track_count: count, total_size: total }],
    additions_by_day: [],
    duration_histogram: [],
    recent_tracks: store.tracks.slice(0, 7),
    favorite_tracks: store.tracks.filter((track) => store.favorites.includes(track.filename)).slice(0, 7),
  };
}

function route(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, resolve: Resolver) {
  return http[method](`${API_BASE}${path}`, async ({ request, params }) => {
    const url = new URL(request.url);
    const contentType = request.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await request.clone().json() : contentType.includes('multipart') ? await request.clone().formData() : null;
    const logged = { method: method.toUpperCase(), path: decodeURIComponent(url.pathname) + url.search, body };
    requests.push(logged);
    if (isDown) return HttpResponse.error();
    const hold = holds.find((entry) => entry.method === logged.method && logged.path.startsWith(entry.path));
    if (hold) await hold.promise;
    if (isDown) return HttpResponse.error();
    const failure = failures.findIndex((entry) => entry.method === logged.method && logged.path.startsWith(entry.path));
    if (failure >= 0) {
      const [{ status, detail }] = failures.splice(failure, 1);
      return error(status, detail);
    }
    const decoded = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, decodeURIComponent(String(value))]));
    const result = await resolve({ params: decoded, url, body, request });
    return result instanceof Response ? result : HttpResponse.json(result);
  });
}

const handlers = [
  route('get', '/', () => ({ status: 'running' })),

  route('get', '/mp3s/paged', ({ url }) => paged(filtered(url), url)),
  route('get', '/mp3s/all', ({ url }) => filtered(url)),
  route('get', '/mp3s/names', () => ({ artists: names('artist'), albums: names('album') })),
  route('post', '/mp3s/bulk/metadata', ({ body }) => {
    const { filenames, artist, album } = body as { filenames: string[]; artist?: string; album?: string };
    return bulk(filenames, (track) => {
      if (artist !== undefined) track.artist = artist || null;
      if (album !== undefined) track.album = album || null;
      track.album_key = albumKeyOf(track.album);
    });
  }),
  route('post', '/mp3s/bulk/cover', ({ body }) => bulk((body as FormData).getAll('filenames').map(String), (track) => {
    track.has_cover = true;
  })),
  route('post', '/mp3s/bulk/delete', ({ body }) => {
    const result = bulk((body as { filenames: string[] }).filenames, () => undefined);
    store.tracks = store.tracks.filter((track) => !result.updated.includes(track.filename));
    store.favorites = store.favorites.filter((filename) => !result.updated.includes(filename));
    return result;
  }),
  route('get', '/mp3s/:filename/info', ({ params }) => findTrack(params.filename) ?? error(404, 'MP3 file not found')),
  route('put', '/mp3s/:filename/metadata', ({ params, body }) => {
    const track = findTrack(params.filename);
    if (!track) return error(404, 'MP3 file not found');
    const update = body as { title?: string; artist?: string; album?: string; new_filename?: string };
    if (update.title !== undefined) track.title = update.title;
    if (update.artist !== undefined) track.artist = update.artist;
    if (update.album !== undefined) track.album = update.album;
    track.album_key = albumKeyOf(track.album);
    if (update.new_filename && update.new_filename !== track.filename) {
      const name = update.new_filename.toLowerCase().endsWith('.mp3') ? update.new_filename.toLowerCase() : `${update.new_filename.toLowerCase()}.mp3`;
      if (findTrack(name)) return error(400, 'A file with that name already exists');
      store.playlists.forEach((playlist) => {
        playlist.filenames = playlist.filenames.map((filename) => (filename === track.filename ? name : filename));
      });
      store.favorites = store.favorites.map((filename) => (filename === track.filename ? name : filename));
      track.filename = name;
    }
    return { success: true, filename: track.filename, message: 'Metadata updated successfully' };
  }),
  route('post', '/mp3s/:filename/cover', ({ params }) => {
    const track = findTrack(params.filename);
    if (!track) return error(404, 'MP3 file not found');
    track.has_cover = true;
    return { success: true };
  }),
  route('get', '/mp3s/:filename/cover', () => error(404, 'No cover image found')),
  route('get', '/mp3s/:filename', ({ params }) => (findTrack(params.filename) ? new HttpResponse(new Uint8Array(16), { headers: { 'Content-Type': 'audio/mpeg' } }) : error(404, 'MP3 file not found'))),
  route('delete', '/mp3s/:filename', ({ params }) => {
    if (!findTrack(params.filename)) return error(404, 'MP3 file not found');
    store.tracks = store.tracks.filter((track) => track.filename !== params.filename);
    return { success: true };
  }),

  route('get', '/albums/paged', ({ url }) => {
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    return paged(albums().filter((album) => !search || album.album_name.toLowerCase().includes(search) || album.artists.join(' ').toLowerCase().includes(search)), url);
  }),
  route('get', '/albums/:key/cover', () => error(404, 'No cover image found')),
  route('get', '/albums/:key', ({ params }) => {
    const album = albums().find((entry) => entry.album_key === params.key);
    if (!album) return error(404, 'Album not found');
    return { album, tracks: store.tracks.filter((track) => albumKeyOf(track.album) === params.key) };
  }),
  route('put', '/albums/:key', ({ params, body }) => {
    const { album_name, artist } = body as { album_name: string; artist?: string };
    const tracks = store.tracks.filter((track) => albumKeyOf(track.album) === params.key);
    if (!tracks.length) return error(404, 'Album not found');
    tracks.forEach((track) => {
      track.album = album_name.trim() || null;
      track.album_key = albumKeyOf(track.album);
      if (artist !== undefined) track.artist = artist || null;
    });
    return { success: true, album_key: albumKeyOf(album_name), album_name: album_name.trim() || '(No Album)', updated_tracks: tracks.length, message: 'Album metadata updated successfully' };
  }),
  route('post', '/albums/:key/cover', ({ params }) => {
    const tracks = store.tracks.filter((track) => albumKeyOf(track.album) === params.key);
    tracks.forEach((track) => {
      track.has_cover = true;
    });
    return { success: true, updated_tracks: tracks.length, message: 'ok' };
  }),

  route('get', '/stats', () => stats()),
  route('post', '/cache/clear', () => ({ success: true })),
  route('get', '/search', ({ url }) => {
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const limit = Number(url.searchParams.get('limit') ?? 5);
    if (!query) return { tracks: [], albums: [] };
    const tracks = store.tracks.filter((track) => [track.title, track.artist, track.album].some((field) => (field ?? '').toLowerCase().includes(query)));
    return { tracks: tracks.slice(0, limit), albums: albums().filter((album) => album.album_name.toLowerCase().includes(query)).slice(0, limit) };
  }),
  route('get', '/youtube/search', ({ url }) => ({ query: url.searchParams.get('query'), results: store.youtube })),
  route('get', '/youtube/songs', () => store.songs),
  route('post', '/youtube/silence', () => ({ start: 1.5, end: 197.5, duration: 200 })),
  route('post', '/download', ({ body }) => {
    const request = body as { url: string; custom_filename?: string; title?: string; artist?: string; album?: string };
    const filename = `${(request.custom_filename || request.title || 'download').toLowerCase()}.mp3`;
    store.tracks.unshift({ filename, title: request.title ?? null, artist: request.artist ?? null, album: request.album ?? null, has_cover: false, file_size: 1, duration: 180, date_added: stamp() });
    return { success: true, filename, message: `Successfully downloaded: ${filename}` };
  }),

  route('get', '/favorites', () => store.favorites),
  route('put', '/favorites/:filename', ({ params }) => {
    if (!store.favorites.includes(params.filename)) store.favorites.push(params.filename);
    return { success: true };
  }),
  route('delete', '/favorites/:filename', ({ params }) => {
    store.favorites = store.favorites.filter((filename) => filename !== params.filename);
    return { success: true };
  }),

  route('get', '/playlists', () => store.playlists.map(playlistInfo)),
  route('post', '/playlists', ({ body }) => {
    const { name, filenames = [] } = body as { name: string; filenames?: string[] };
    const playlist = makePlaylist({ name: name.trim(), filenames });
    store.playlists.push(playlist);
    return playlistDetail(playlist);
  }),
  route('get', '/playlists/:id/cover', () => error(404, 'No cover image found')),
  route('get', '/playlists/:id', ({ params }) => {
    const playlist = findPlaylist(params.id);
    return playlist ? playlistDetail(playlist) : error(404, 'Playlist not found');
  }),
  route('put', '/playlists/:id', ({ params, body }) => {
    const playlist = findPlaylist(params.id);
    if (!playlist) return error(404, 'Playlist not found');
    const update = body as { name?: string; description?: string; filenames?: string[] };
    Object.assign(playlist, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)), { updated_at: new Date().toISOString() });
    return playlistDetail(playlist);
  }),
  route('post', '/playlists/:id/tracks', ({ params, body }) => {
    const playlist = findPlaylist(params.id);
    if (!playlist) return error(404, 'Playlist not found');
    const added = (body as { filenames: string[] }).filenames.filter((filename) => !playlist.filenames.includes(filename));
    playlist.filenames = [...added, ...playlist.filenames];
    return playlistInfo(playlist);
  }),
  route('post', '/playlists/:id/cover', ({ params }) => {
    const playlist = findPlaylist(params.id);
    if (!playlist) return error(404, 'Playlist not found');
    playlist.has_cover = true;
    return playlistInfo(playlist);
  }),
  route('delete', '/playlists/:id', ({ params }) => {
    if (!findPlaylist(params.id)) return error(404, 'Playlist not found');
    store.playlists = store.playlists.filter((playlist) => playlist.id !== params.id);
    return { success: true };
  }),

  route('get', '/queue', () => store.queue),
  route('post', '/queue/start', ({ body }) => {
    const ids = (body as { ids?: number[] }).ids;
    store.queue.forEach((item) => {
      if (item.status === 'pending' && (!ids || ids.includes(item.id))) item.status = 'queued';
    });
    return store.queue;
  }),
  route('post', '/queue/stop', () => {
    store.queue.forEach((item) => {
      if (item.status === 'queued') item.status = 'pending';
    });
    return store.queue;
  }),
  route('post', '/queue/:id/cancel', ({ params }) => {
    const item = store.queue.find((entry) => entry.id === Number(params.id));
    if (!item || item.status !== 'running') return error(409, "This download isn't running");
    item.status = 'pending';
    return store.queue;
  }),
  route('post', '/queue/clear', () => {
    store.queue = store.queue.filter((item) => item.status !== 'done');
    return store.queue;
  }),
  route('post', '/queue', ({ body }) => {
    const created = (body as { items: Array<Partial<QueueItem>> }).items.map((item) => makeQueueItem({ ...item, custom_filename: item.custom_filename?.trim().toLowerCase() || null }));
    store.queue.push(...created);
    return created;
  }),
  route('patch', '/queue/:id', ({ params, body }) => {
    const item = store.queue.find((entry) => entry.id === Number(params.id));
    if (!item) return error(404, 'Download not found');
    Object.assign(item, body);
    return item;
  }),
  route('delete', '/queue/:id', ({ params }) => {
    store.queue = store.queue.filter((entry) => entry.id !== Number(params.id));
    return { success: true };
  }),

  route('get', '/health/silence', () => null),
  route('post', '/health/silence/scan', () => ({ status: 'done', total: store.tracks.length, done: store.tracks.length, tracks: store.silent, error: null })),
  route('post', '/health/silence/trim', ({ body }) => bulk((body as { filenames: string[] }).filenames, () => undefined)),
  route('get', '/health/naming', () => store.naming),
  route('post', '/health/naming/fix', ({ body }) => bulk((body as { items: Array<{ filename: string }> }).items.map((item) => item.filename), () => undefined)),
  route('get', '/health/artists', () => store.artists),
  route('post', '/health/artists/fix', ({ body }) => bulk((body as { items: Array<{ filename: string }> }).items.map((item) => item.filename), () => undefined)),

  route('get', '/sync/device', () => ({ device: { id: 'this-device', name: 'This PC' }, port: null })),
  route('post', '/sync/start', ({ body }) => ({ device: { id: 'this-device', name: 'This PC' }, port: (body as { port: number }).port })),
  route('post', '/sync/stop', () => ({ device: { id: 'this-device', name: 'This PC' }, port: null })),
  route('get', '/sync/peers', () => []),
  route('get', '/sync/session', () => null),

  route('get', '/music/status', () => ({ available: false, detected_folder: null })),

  http.all('*', ({ request }) => {
    unhandled.push(`${request.method} ${request.url}`);
    return HttpResponse.error();
  }),
];

export const server = setupServer(...handlers);

export const backend = {
  get store(): Store {
    return store;
  },
  seed(partial: Partial<Store>): Store {
    Object.assign(store, partial);
    return store;
  },
  get requests(): LoggedRequest[] {
    return requests;
  },
  requestsTo(method: string, path: string): LoggedRequest[] {
    return requests.filter((entry) => entry.method === method && entry.path.startsWith(path));
  },
  down(): void {
    isDown = true;
  },
  up(): void {
    isDown = false;
  },
  hold(method: string, path: string): () => void {
    let release = () => undefined as void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hold = { method, path, promise, release: () => undefined as void };
    hold.release = () => {
      holds = holds.filter((entry) => entry !== hold);
      release();
    };
    holds.push(hold);
    return hold.release;
  },
  fail(method: string, path: string, status = 500, detail = 'Something went wrong'): void {
    failures.push({ method, path, status, detail });
  },
  takeUnhandled(): string[] {
    return unhandled.splice(0);
  },
  reset(): void {
    holds.forEach((hold) => hold.release());
    store = emptyStore();
    isDown = false;
    holds = [];
    failures = [];
    requests.length = 0;
    unhandled.length = 0;
  },
};
