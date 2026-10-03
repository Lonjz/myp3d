import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SPOTLIGHT_COMMAND_PREFIX, SPOTLIGHT_SECTIONS, SPOTLIGHT_SECTION_LIMIT } from './spotlightTypes';
import type {
  InstantSpotlightSource,
  RemoteSpotlightSource,
  SpotlightItem,
  SpotlightSection,
  SpotlightSource,
} from './spotlightTypes';

const REMOTE_DELAY_MS = 120;

export interface SpotlightResultSection {
  section: SpotlightSection;
  items: SpotlightItem[];
}

export interface SpotlightResults {
  sections: SpotlightResultSection[];
  items: SpotlightItem[];
  loading: boolean;
}

export function useSpotlightResults(query: string, sources: SpotlightSource[]): SpotlightResults {
  const trimmed = query.trim();
  const commandMode = trimmed.startsWith(SPOTLIGHT_COMMAND_PREFIX);
  const searchText = commandMode ? trimmed.slice(SPOTLIGHT_COMMAND_PREFIX.length).trim() : trimmed;
  const debounced = useDebouncedValue(commandMode ? '' : trimmed, REMOTE_DELAY_MS);
  const [remote, setRemote] = useState<{ query: string; items: SpotlightItem[] }>({ query: '', items: [] });

  const instantSources = useMemo(
    () => sources.filter((source): source is InstantSpotlightSource => !source.remote),
    [sources],
  );
  const remoteSources = useMemo(
    () => sources.filter((source): source is RemoteSpotlightSource => source.remote === true),
    [sources],
  );

  useEffect(() => {
    if (!debounced || remoteSources.length === 0) return undefined;
    const controller = new AbortController();

    Promise.all(
      remoteSources.map((source) => source.search(debounced, controller.signal).catch(() => [] as SpotlightItem[])),
    ).then((results) => {
      if (!controller.signal.aborted) {
        setRemote({ query: debounced, items: results.flat() });
      }
    });

    return () => controller.abort();
  }, [debounced, remoteSources]);

  const instantItems = useMemo(() => {
    if (!trimmed) return [];
    const activeSources = commandMode ? instantSources.filter((source) => source.commands) : instantSources;
    return activeSources.flatMap((source) => source.search(searchText));
  }, [commandMode, instantSources, searchText, trimmed]);

  const remoteItems = trimmed && !commandMode && remote.query ? remote.items : null;

  return useMemo(() => {
    const allItems = [...instantItems, ...(remoteItems ?? [])];
    const sections = SPOTLIGHT_SECTIONS.map((section) => ({
      section,
      items: allItems.filter((item) => item.section === section.id).slice(0, section.limit ?? SPOTLIGHT_SECTION_LIMIT),
    })).filter((entry) => entry.items.length > 0);

    return {
      sections,
      items: sections.flatMap((entry) => entry.items),
      loading: Boolean(trimmed) && !commandMode && remoteSources.length > 0 && remote.query !== trimmed,
    };
  }, [commandMode, instantItems, remoteItems, remoteSources.length, remote.query, trimmed]);
}
