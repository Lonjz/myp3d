import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAppEvent } from '../utils/appEvents';

type InfinitePage<TItem> = {
  items: TItem[];
  meta: { total: number };
};

type UseInfiniteListOptions<TParams extends Record<string, unknown>, TItem> = {
  pageSize: number;
  params: TParams;
  fetchPage: (params: TParams & { page: number; limit: number }) => Promise<InfinitePage<TItem>>;
  getKey: (item: TItem) => string;
  errorMessage: string;
};

type ListState<TItem> = {
  items: TItem[];
  total: number;
  pages: number;
};

let libraryVersion = 0;

subscribeAppEvent('library-changed', () => {
  libraryVersion += 1;
});

function appendUnique<TItem>(base: TItem[], incoming: TItem[], getKey: (item: TItem) => string): TItem[] {
  const seen = new Set(base.map(getKey));
  const merged = [...base];
  for (const item of incoming) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export function useInfiniteList<TParams extends Record<string, unknown>, TItem>({
  pageSize,
  params,
  fetchPage,
  getKey,
  errorMessage,
}: UseInfiniteListOptions<TParams, TItem>) {
  const [list, setList] = useState<ListState<TItem>>({ items: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadedParamsRef = useRef<TParams | null>(null);
  const loadedVersionRef = useRef(libraryVersion);

  const replace = useCallback(
    async (pageCount: number) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      loadedVersionRef.current = libraryVersion;
      setLoading(true);

      try {
        const responses = await Promise.all(
          Array.from({ length: pageCount }, (_, index) => fetchPage({ ...params, page: index + 1, limit: pageSize })),
        );
        if (requestId !== requestIdRef.current) {
          return;
        }

        setList({
          items: appendUnique([], responses.flatMap((response) => response.items), getKey),
          total: responses[responses.length - 1].meta.total,
          pages: pageCount,
        });
        setError(null);
      } catch {
        if (requestId === requestIdRef.current) {
          setError(errorMessage);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [errorMessage, fetchPage, getKey, pageSize, params],
  );

  const hasMore = !error && list.pages > 0 && list.pages * pageSize < list.total;

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading || !hasMore) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const requestId = requestIdRef.current;

    try {
      const response = await fetchPage({ ...params, page: list.pages + 1, limit: pageSize });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setList((prev) => ({
        items: appendUnique(prev.items, response.items, getKey),
        total: response.meta.total,
        pages: prev.pages + 1,
      }));
      setError(null);
    } catch {
      if (requestId === requestIdRef.current) {
        setError(errorMessage);
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [errorMessage, fetchPage, getKey, hasMore, list.pages, loading, pageSize, params]);

  const refresh = useCallback(() => replace(Math.max(1, list.pages)), [list.pages, replace]);

  useEffect(() => {
    if (loadedParamsRef.current !== params) {
      loadedParamsRef.current = params;
      void replace(1);
    } else if (loadedVersionRef.current !== libraryVersion) {
      void refresh();
    }
  }, [params, refresh, replace]);

  useEffect(() => subscribeAppEvent('library-changed', () => void refresh()), [refresh]);

  return {
    items: list.items,
    total: list.total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
