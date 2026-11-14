import { useCallback, useRef, useState } from 'react';
import { mp3Api } from '../../api/mp3Api';
import type { YouTubePlaylist, YouTubeRelease, YouTubeSearchResult } from '../../api/mp3Api';
import { queueApi } from '../../api/queueApi';
import { emitAppEvent } from '../../utils/appEvents';
import { countOf, errorMessage } from '../../utils/formatters';
import { useToast } from '../messages/toastContext';

export interface ArtistView {
  name: string;
  songs: YouTubeSearchResult[];
  releases: YouTubeRelease[];
}

export type QuerySource =
  | { kind: 'search' }
  | { kind: 'playlist'; title: string; unavailable: number }
  | { kind: 'artist'; artist: ArtistView }
  | { kind: 'album'; title: string; unavailable: number; from: ArtistView | null }
  | { kind: 'similar'; title: string };

export type ArtistTab = 'songs' | 'releases';

interface Loaded {
  results: YouTubeSearchResult[];
  source: QuerySource;
}

interface LoadOptions {
  failed: string;
  empty: string;
  selectFresh: boolean;
}

interface Failure {
  label: string;
  retry: () => void;
}

export const resultKey = (result: YouTubeSearchResult) => result.video_id || result.url;

const playlistSource = (playlist: YouTubePlaylist) => ({ title: playlist.title, unavailable: playlist.unavailable });

const hasReleases = (source: QuerySource) => source.kind === 'artist' && source.artist.releases.length > 0;

export function useQueryResults() {
  const { showSuccess, showError, clearToast } = useToast();
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [source, setSource] = useState<QuerySource | null>(null);
  const [tab, setTab] = useState<ArtistTab>('songs');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const [queueing, setQueueing] = useState(false);
  const runRef = useRef(0);

  const load = useCallback(
    async (fetch: () => Promise<Loaded>, options: LoadOptions): Promise<YouTubeSearchResult[] | null> => {
      const run = runRef.current + 1;
      runRef.current = run;
      setLoading(true);
      setFailure(null);
      clearToast();
      try {
        const next = await fetch();
        if (runRef.current !== run) return null;
        setResults(next.results);
        setSource(next.source);
        setTab(next.results.length === 0 && hasReleases(next.source) ? 'releases' : 'songs');
        setSelected(new Set(options.selectFresh ? next.results.filter((result) => !result.in_library).map(resultKey) : []));
        if (next.results.length === 0 && !hasReleases(next.source)) showError(options.empty);
        return next.results;
      } catch (err) {
        if (runRef.current === run) {
          setFailure({ label: errorMessage(err, options.failed), retry: () => void load(fetch, options) });
        }
        return null;
      } finally {
        if (runRef.current === run) setLoading(false);
      }
    },
    [clearToast, showError],
  );

  const search = useCallback(
    (query: string) =>
      load(async () => ({ results: await mp3Api.searchYouTube(query, 20), source: { kind: 'search' } }), {
        failed: 'YouTube search failed',
        empty: 'Nothing found. Try another search.',
        selectFresh: false,
      }),
    [load],
  );

  const openPlaylist = useCallback(
    (url: string) =>
      load(
        async () => {
          const playlist = await mp3Api.youtubePlaylist(url);
          return { results: playlist.tracks, source: { kind: 'playlist', ...playlistSource(playlist) } };
        },
        { failed: "Couldn't open the playlist", empty: 'No songs in that playlist', selectFresh: true },
      ),
    [load],
  );

  const openArtist = useCallback(
    (name: string) =>
      load(
        async () => {
          const artist = await mp3Api.youtubeArtist(name);
          return { results: artist.songs, source: { kind: 'artist', artist } };
        },
        { failed: "Couldn't load the artist", empty: 'No songs found for that artist', selectFresh: false },
      ),
    [load],
  );

  const openAlbum = useCallback(
    (browseId: string) => {
      const from = source?.kind === 'artist' ? source.artist : null;
      return load(
        async () => {
          const album = await mp3Api.youtubeAlbum(browseId);
          return { results: album.tracks, source: { kind: 'album', ...playlistSource(album), from } };
        },
        { failed: "Couldn't load the album", empty: 'No songs on that album', selectFresh: true },
      );
    },
    [load, source],
  );

  const openSimilar = useCallback(
    (filename: string) =>
      load(
        async () => {
          const similar = await mp3Api.youtubeSimilar(filename);
          return { results: similar.tracks, source: { kind: 'similar', title: similar.title } };
        },
        { failed: "Couldn't find similar songs", empty: 'No similar songs found', selectFresh: false },
      ),
    [load],
  );

  const backToArtist = useCallback(() => {
    if (source?.kind !== 'album' || !source.from) return;
    runRef.current += 1;
    setLoading(false);
    setFailure(null);
    setResults(source.from.songs);
    setSource({ kind: 'artist', artist: source.from });
    setTab('releases');
    setSelected(new Set());
  }, [source]);

  const setRowSelected = useCallback((key: string, on: boolean) => {
    setSelected((previous) => {
      if (previous.has(key) === on) return previous;
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const queueSelected = useCallback(async () => {
    const picks = results.filter((result) => selected.has(resultKey(result)) && !queued.has(resultKey(result)));
    if (picks.length === 0) return;

    setQueueing(true);
    try {
      await queueApi.add(
        picks.map((result) => ({
          url: result.url,
          custom_filename: result.filename ?? undefined,
          title: result.title,
          artist: result.artist ?? undefined,
          album: result.album ?? undefined,
          cover_url: result.cover_url ?? undefined,
        })),
      );
      emitAppEvent('queue-changed');
      const keys = picks.map(resultKey);
      setQueued((previous) => new Set([...previous, ...keys]));
      setSelected((previous) => new Set([...previous].filter((key) => !keys.includes(key))));
      showSuccess(`Queued ${countOf(picks.length, 'song')}`);
    } catch (err) {
      showError(errorMessage(err, 'Failed to queue the songs'));
    } finally {
      setQueueing(false);
    }
  }, [results, selected, queued, showError, showSuccess]);

  return {
    results,
    source,
    tab,
    loading,
    failure,
    selected,
    queued,
    queueing,
    search,
    openPlaylist,
    openArtist,
    openAlbum,
    openSimilar,
    backToArtist,
    setTab,
    setSelected,
    setRowSelected,
    queueSelected,
  };
}
