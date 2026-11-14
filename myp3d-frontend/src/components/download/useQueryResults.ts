import { useCallback, useRef, useState } from 'react';
import { mp3Api } from '../../api/mp3Api';
import type { YouTubeSearchResult } from '../../api/mp3Api';
import { queueApi } from '../../api/queueApi';
import { emitAppEvent } from '../../utils/appEvents';
import { countOf, errorMessage } from '../../utils/formatters';
import { useToast } from '../messages/toastContext';

export type QuerySource = { kind: 'search' } | { kind: 'playlist'; title: string; unavailable: number };

interface Loaded {
  results: YouTubeSearchResult[];
  source: QuerySource;
}

export const resultKey = (result: YouTubeSearchResult) => result.video_id || result.url;

export function useQueryResults() {
  const { showSuccess, showError, clearToast } = useToast();
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [source, setSource] = useState<QuerySource | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const [queueing, setQueueing] = useState(false);
  const runRef = useRef(0);

  const load = useCallback(
    async (fetch: () => Promise<Loaded>, failed: string, empty: string, selectFresh: boolean) => {
      const run = runRef.current + 1;
      runRef.current = run;
      setLoading(true);
      clearToast();
      try {
        const next = await fetch();
        if (runRef.current !== run) return null;
        setResults(next.results);
        setSource(next.source);
        setQueued(new Set());
        setSelected(new Set(selectFresh ? next.results.filter((result) => !result.in_library).map(resultKey) : []));
        if (next.results.length === 0) showError(empty);
        return next.results;
      } catch (err) {
        if (runRef.current === run) showError(errorMessage(err, failed));
        return null;
      } finally {
        if (runRef.current === run) setLoading(false);
      }
    },
    [clearToast, showError],
  );

  const search = useCallback(
    (query: string) =>
      load(
        async () => ({ results: await mp3Api.searchYouTube(query, 20), source: { kind: 'search' } }),
        'YouTube search failed',
        'Nothing found. Try another search.',
        false,
      ),
    [load],
  );

  const openPlaylist = useCallback(
    (url: string) =>
      load(
        async () => {
          const playlist = await mp3Api.youtubePlaylist(url);
          return {
            results: playlist.tracks,
            source: { kind: 'playlist', title: playlist.title, unavailable: playlist.unavailable },
          };
        },
        "Couldn't open the playlist",
        'No songs in that playlist',
        true,
      ),
    [load],
  );

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
    loading,
    selected,
    queued,
    queueing,
    search,
    openPlaylist,
    setSelected,
    setRowSelected,
    queueSelected,
  };
}
