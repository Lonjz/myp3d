import { useEffect, useState } from 'react';
import { DiscAlbum, MicVocal, MonitorPlay } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { LibraryNames, TagSuggestion } from '../api/mp3Api';
import type { Suggestion } from '../components/ui/SuggestField';
import { subscribeAppEvent } from '../utils/appEvents';
import { formatTrackSubtitle } from '../utils/formatters';
import { useDebouncedValue } from './useDebouncedValue';

const LIBRARY_LIMIT = 6;
const SONG_QUERY_MIN = 3;
const SONG_QUERY_DELAY_MS = 500;

interface TagFields {
  title: string;
  artist: string;
  album: string;
  onTitleChange: (value: string) => void;
  onArtistChange: (value: string) => void;
  onAlbumChange: (value: string) => void;
}

const libraryMatches = (values: string[] | undefined, typed: string, icon: LucideIcon, apply: (value: string) => void): Suggestion[] => {
  const needle = typed.trim().toLocaleLowerCase();
  if (!needle || !values) return [];
  const prefix: string[] = [];
  const inner: string[] = [];
  for (const value of values) {
    const lower = value.toLocaleLowerCase();
    if (lower === needle) continue;
    if (lower.startsWith(needle)) prefix.push(value);
    else if (lower.includes(needle)) inner.push(value);
  }
  return [...prefix, ...inner]
    .slice(0, LIBRARY_LIMIT)
    .map((value) => ({ key: `library:${value}`, text: value, icon, source: 'Library', pick: () => apply(value) }));
};

export function useTagSuggestions({ title, artist, album, onTitleChange, onArtistChange, onAlbumChange }: TagFields) {
  const [names, setNames] = useState<LibraryNames | null>(null);
  const [songs, setSongs] = useState<{ query: string; results: TagSuggestion[] } | null>(null);
  const query = useDebouncedValue(title.trim().length >= SONG_QUERY_MIN ? `${title} ${artist}`.trim() : '', SONG_QUERY_DELAY_MS);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      mp3Api.libraryNames().then((loaded) => {
        if (!cancelled) setNames(loaded);
      }, () => undefined);
    };
    load();
    const unsubscribe = subscribeAppEvent('library-changed', load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!query) return undefined;
    let cancelled = false;
    mp3Api.songSuggestions(query).then((results) => {
      if (!cancelled) setSongs({ query, results });
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [query]);

  const songResults = songs && query && songs.query === query ? songs.results : [];
  const songMatches: Suggestion[] = songResults.map((song) => ({
    key: `song:${song.title}:${song.artist}:${song.album}`,
    text: song.title,
    sub: formatTrackSubtitle(song.artist, song.album) || undefined,
    icon: MonitorPlay,
    source: 'YouTube Music',
    pick: () => {
      onTitleChange(song.title);
      if (song.artist) onArtistChange(song.artist);
      if (song.album) onAlbumChange(song.album);
    },
  }));

  return {
    title: songMatches,
    artist: libraryMatches(names?.artists, artist, MicVocal, onArtistChange),
    album: libraryMatches(names?.albums, album, DiscAlbum, onAlbumChange),
  };
}
