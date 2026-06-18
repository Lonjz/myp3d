import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SidebarPageResult<T> {
  items: T[];
  total: number;
  totalPages: number;
}

interface QueryCacheEntry<T> {
  items: T[];
  total: number;
  totalPages: number;
  loadedPages: number[];
}

interface InfiniteSidebarListProps<T> {
  title: string;
  backLabel: string;
  onBack: () => void;
  searchPlaceholder: string;
  activeKey: string;
  getItemKey: (item: T) => string;
  getItemTitle: (item: T) => string;
  getItemSubtitle: (item: T) => string;
  onSelect: (item: T) => void;
  fetchPage: (params: { page: number; limit: number; search: string }) => Promise<SidebarPageResult<T>>;
  emptyMessage: string;
  pinnedItem?: T | null;
  pageSize?: number;
  searchDebounceMs?: number;
  scrollStorageKey?: string;
}

export function InfiniteSidebarList<T>({
  title,
  backLabel,
  onBack,
  searchPlaceholder,
  activeKey,
  getItemKey,
  getItemTitle,
  getItemSubtitle,
  onSelect,
  fetchPage,
  emptyMessage,
  pinnedItem = null,
  pageSize = 25,
  searchDebounceMs = 300,
  scrollStorageKey,
}: InfiniteSidebarListProps<T>) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cacheByQuery, setCacheByQuery] = useState<Record<string, QueryCacheEntry<T>>>({});
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inflightKeysRef = useRef<Set<string>>(new Set());
  const hasRestoredScrollRef = useRef(false);

  // Mirror props/state that change identity every render into refs so the
  // fetch callback below stays stable and doesn't tear down the
  // IntersectionObserver on each parent re-render.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const getItemKeyRef = useRef(getItemKey);
  getItemKeyRef.current = getItemKey;
  const cacheRef = useRef(cacheByQuery);
  cacheRef.current = cacheByQuery;

  const normalizedQuery = debouncedSearch.trim();
  const currentEntry = cacheByQuery[normalizedQuery];
  const loadedItems = currentEntry?.items ?? [];
  const loadedCount = loadedItems.length;
  const totalCount = currentEntry?.total ?? 0;
  const maxLoadedPage = currentEntry?.loadedPages.length
    ? Math.max(...currentEntry.loadedPages)
    : 0;
  const hasMore = currentEntry ? maxLoadedPage < currentEntry.totalPages : false;

  const mergeUniqueItems = useCallback((base: T[], incoming: T[]) => {
    const getKey = getItemKeyRef.current;
    const seenKeys = new Set(base.map((item) => getKey(item)));
    const merged = [...base];
    for (const item of incoming) {
      const key = getKey(item);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        merged.push(item);
      }
    }
    return merged;
  }, []);

  const fetchQueryPage = useCallback(
    async (query: string, page: number) => {
      const requestKey = `${query}::${page}`;
      if (inflightKeysRef.current.has(requestKey)) {
        return;
      }

      const existingEntry = cacheRef.current[query];
      if (existingEntry?.loadedPages.includes(page)) {
        return;
      }

      inflightKeysRef.current.add(requestKey);
      if (page === 1) {
        setIsLoadingInitial(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await fetchPageRef.current({
          page,
          limit: pageSize,
          search: query,
        });

        setCacheByQuery((prev) => {
          const previousEntry = prev[query] ?? {
            items: [],
            total: 0,
            totalPages: 1,
            loadedPages: [],
          };

          const nextItems =
            page === 1
              ? response.items
              : mergeUniqueItems(previousEntry.items, response.items);

          const nextPages = previousEntry.loadedPages.includes(page)
            ? previousEntry.loadedPages
            : [...previousEntry.loadedPages, page].sort((a, b) => a - b);

          return {
            ...prev,
            [query]: {
              items: nextItems,
              total: response.total,
              totalPages: response.totalPages,
              loadedPages: nextPages,
            },
          };
        });
        setError(null);
      } catch {
        setError('Failed to load sidebar items.');
      } finally {
        inflightKeysRef.current.delete(requestKey);
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
      }
    },
    [mergeUniqueItems, pageSize],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, searchDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, searchDebounceMs]);

  useEffect(() => {
    const entry = cacheByQuery[normalizedQuery];
    if (!entry || !entry.loadedPages.includes(1)) {
      void fetchQueryPage(normalizedQuery, 1);
    }
  }, [cacheByQuery, fetchQueryPage, normalizedQuery]);

  useEffect(() => {
    if (!listRef.current || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting || isLoadingInitial || isLoadingMore || !hasMore) {
          return;
        }

        const nextPage = maxLoadedPage + 1;
        if (nextPage > 0) {
          void fetchQueryPage(normalizedQuery, nextPage);
        }
      },
      {
        root: listRef.current,
        rootMargin: '0px 0px 120px 0px',
        threshold: 0.1,
      },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchQueryPage, hasMore, isLoadingInitial, isLoadingMore, maxLoadedPage, normalizedQuery]);

  useEffect(() => {
    if (!scrollStorageKey || hasRestoredScrollRef.current || !listRef.current || typeof window === 'undefined') {
      return;
    }

    const storedScrollTop = window.sessionStorage.getItem(scrollStorageKey);
    const scrollTop = storedScrollTop ? Number(storedScrollTop) : 0;

    if (Number.isFinite(scrollTop) && scrollTop > 0) {
      listRef.current.scrollTop = scrollTop;
    }

    hasRestoredScrollRef.current = true;
  }, [scrollStorageKey]);

  const handleListScroll = useCallback(() => {
    if (!scrollStorageKey || typeof window === 'undefined' || !listRef.current) {
      return;
    }

    window.sessionStorage.setItem(scrollStorageKey, String(listRef.current.scrollTop));
  }, [scrollStorageKey]);

  const visibleItems = useMemo(() => {
    if (!pinnedItem) {
      return loadedItems;
    }

    const pinnedKey = getItemKey(pinnedItem);
    if (loadedItems.some((item) => getItemKey(item) === pinnedKey)) {
      return loadedItems;
    }

    return [pinnedItem, ...loadedItems];
  }, [getItemKey, loadedItems, pinnedItem]);

  return (
    <aside className="details-sidebar">
      <button onClick={onBack} className="btn-secondary details-back-btn">
        {backLabel}
      </button>

      <h3>{title}</h3>
      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>

      <p className="input-help details-sidebar-meta">Showing {loadedCount} of {totalCount}</p>

      <div className="details-song-list" ref={listRef} onScroll={handleListScroll}>
        {visibleItems.map((item) => {
          const itemKey = getItemKey(item);
          const isActive = itemKey === activeKey;

          return (
            <button
              key={itemKey}
              type="button"
              className={`details-song-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(item)}
              disabled={isActive}
            >
              <span className="details-song-title">{getItemTitle(item)}</span>
              <span className="details-song-subtitle">{getItemSubtitle(item)}</span>
            </button>
          );
        })}

        {!isLoadingInitial && visibleItems.length === 0 && (
          <p className="input-help">{emptyMessage}</p>
        )}

        {(isLoadingInitial || isLoadingMore) && (
          <p className="input-help details-sidebar-loading">Loading...</p>
        )}

        <div ref={sentinelRef} className="details-sidebar-sentinel" aria-hidden="true" />
      </div>

      {error && <p className="error">{error}</p>}
    </aside>
  );
}
