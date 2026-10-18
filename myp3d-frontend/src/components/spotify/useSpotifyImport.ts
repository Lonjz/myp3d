import { useCallback, useRef, useState } from 'react';
import { queueApi } from '../../api/queueApi';
import { spotifyApi } from '../../api/spotifyApi';
import type { SpotifyCandidate, SpotifyTrackMatch, SpotifyTrackRef } from '../../api/spotifyApi';
import { emitAppEvent } from '../../utils/appEvents';
import { extractTrackLinks } from '../../utils/spotify';
import { getVideoIdFromUrl, getYouTubeThumbnailUrl } from '../../utils/youtube';
import { useToast } from '../messages/toastContext';

export const GOOD_MATCH = 0.7;
const MATCH_CONCURRENCY = 4;

export interface SpotifyRow {
  ref: SpotifyTrackRef;
  match: SpotifyTrackMatch | null;
  choice: SpotifyCandidate | null;
  error: string | null;
  queued: boolean;
}

type ReadyRow = SpotifyRow & { match: SpotifyTrackMatch; choice: SpotifyCandidate };

export const isReadyRow = (row: SpotifyRow): row is ReadyRow =>
  row.match !== null && row.choice !== null && !row.queued;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const songs = (count: number) => `${count} song${count === 1 ? '' : 's'}`;

const links = (count: number) => `${count} link${count === 1 ? '' : 's'}`;

export function useSpotifyImport() {
  const { showSuccess, showError, clearToast } = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<SpotifyRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [queueing, setQueueing] = useState(false);
  const runRef = useRef(0);

  const patchRow = useCallback((id: string, patch: Partial<SpotifyRow>) => {
    setRows((previous) => previous.map((row) => (row.ref.id === id ? { ...row, ...patch } : row)));
  }, []);

  const setRowSelected = useCallback((id: string, on: boolean) => {
    setSelected((previous) => {
      if (previous.has(id) === on) return previous;
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const matchAll = useCallback(
    async (refs: SpotifyTrackRef[], run: number) => {
      let next = 0;
      const worker = async () => {
        while (runRef.current === run && next < refs.length) {
          const ref = refs[next];
          next += 1;
          try {
            const match = await spotifyApi.matchTrack(ref.id, ref.album);
            if (runRef.current !== run) return;
            const choice = match.candidates[0] ?? null;
            patchRow(ref.id, { match, choice });
            if (choice && choice.score >= GOOD_MATCH && !match.in_library) setRowSelected(ref.id, true);
          } catch (err) {
            if (runRef.current === run) patchRow(ref.id, { error: errorMessage(err, 'Failed to match the song') });
          }
        }
      };
      await Promise.all(Array.from({ length: MATCH_CONCURRENCY }, worker));
    },
    [patchRow, setRowSelected],
  );

  const resolve = useCallback(
    async (input: string) => {
      const value = input.trim();
      if (!value) return;
      const run = runRef.current + 1;
      runRef.current = run;
      setResolving(true);
      clearToast();

      let refs: SpotifyTrackRef[];
      try {
        const result = await spotifyApi.resolve(value);
        refs = result.tracks;
        if (runRef.current !== run) return;
        setRows(refs.map((ref) => ({ ref, match: null, choice: null, error: null, queued: false })));
        setTruncated(result.truncated);
        setSelected(new Set());
        if (result.skipped > 0) showError(`Couldn't open ${links(result.skipped)}`);
      } catch (err) {
        if (runRef.current === run) showError(errorMessage(err, 'Failed to read the Spotify links'));
        return;
      } finally {
        if (runRef.current === run) setResolving(false);
      }

      await matchAll(refs, run);
    },
    [clearToast, matchAll, showError],
  );

  const choose = useCallback(
    (id: string, choice: SpotifyCandidate) => {
      patchRow(id, { choice });
      setRowSelected(id, true);
    },
    [patchRow, setRowSelected],
  );

  const chooseUrl = useCallback(
    (id: string, url: string) => {
      const videoId = getVideoIdFromUrl(url);
      choose(id, {
        video_id: videoId,
        url,
        title: url,
        artists: [],
        album: null,
        duration: null,
        thumbnail_url: videoId ? getYouTubeThumbnailUrl(videoId) : null,
        explicit: null,
        kind: 'video',
        score: 1,
      });
    },
    [choose],
  );

  const importFile = useCallback(
    async (file: File) => {
      let contents: string;
      try {
        contents = await file.text();
      } catch {
        showError(`Couldn't read ${file.name}`);
        return;
      }
      const links = extractTrackLinks(contents);
      if (links.length === 0) {
        showError(`No Spotify songs found in ${file.name}`);
        return;
      }
      setText('');
      await resolve(links.join(' '));
    },
    [resolve, showError],
  );

  const clearQueued = useCallback(() => {
    const queued = new Set(rows.filter((row) => row.queued).map((row) => row.ref.id));
    setRows((previous) => previous.filter((row) => !queued.has(row.ref.id)));
    setSelected((previous) => new Set([...previous].filter((id) => !queued.has(id))));
  }, [rows]);

  const clearAll = useCallback(() => {
    runRef.current += 1;
    setRows([]);
    setSelected(new Set());
    setTruncated(false);
    setResolving(false);
    setText('');
  }, []);

  const queueSelected = useCallback(async () => {
    const picks = rows.filter((row): row is ReadyRow => isReadyRow(row) && selected.has(row.ref.id));
    if (picks.length === 0) return;

    setQueueing(true);
    try {
      await queueApi.add(
        picks.map(({ match, choice }) => ({
          url: choice.url,
          custom_filename: match.filename ?? undefined,
          title: match.title,
          artist: match.artist ?? undefined,
          album: match.track.album ?? undefined,
          cover_url: match.track.cover_url ?? undefined,
        })),
      );
      emitAppEvent('queue-changed');
      const ids = new Set(picks.map((row) => row.ref.id));
      setRows((previous) => previous.map((row) => (ids.has(row.ref.id) ? { ...row, queued: true } : row)));
      setSelected((previous) => new Set([...previous].filter((id) => !ids.has(id))));
      showSuccess(`Queued ${songs(picks.length)}`);
    } catch (err) {
      showError(errorMessage(err, 'Failed to queue the songs'));
    } finally {
      setQueueing(false);
    }
  }, [rows, selected, showError, showSuccess]);

  return {
    text,
    setText,
    rows,
    truncated,
    resolving,
    selected,
    queueing,
    resolve,
    setRowSelected,
    setSelected,
    choose,
    chooseUrl,
    importFile,
    clearQueued,
    clearAll,
    queueSelected,
  };
}
