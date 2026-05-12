import { useCallback, useRef, useState } from 'react';

type PagedMeta = {
  total: number;
};

export type PagedResponse<TItem> = {
  items: TItem[];
  meta: PagedMeta;
};

type CacheEntry<TItem> = {
  items: TItem[];
  total: number;
};

const sharedCache = new Map<string, CacheEntry<unknown>>();

const buildCacheKey = (prefix: string, key: string) => `${prefix}::${key}`;

type UsePagedDataOptions<TParams, TItem> = {
  page: number;
  pageSize: number;
  params: TParams;
  fetchPage: (params: TParams & { page: number; limit: number }) => Promise<PagedResponse<TItem>>;
  errorMessage: string;
  cacheKeyPrefix: string;
};

export function usePagedData<TParams extends Record<string, unknown>, TItem>(
  options: UsePagedDataOptions<TParams, TItem>,
) {
  const { page, pageSize, params, fetchPage, errorMessage, cacheKeyPrefix } = options;
  const [items, setItems] = useState<TItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const invalidateCache = useCallback(() => {
    const prefix = `${cacheKeyPrefix}::`;
    for (const key of sharedCache.keys()) {
      if (key.startsWith(prefix)) {
        sharedCache.delete(key);
      }
    }
  }, [cacheKeyPrefix]);

  const loadPage = useCallback(
    async (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      const cacheKeyBase = JSON.stringify({
        page,
        limit: pageSize,
        ...params,
      });
      const cacheKey = buildCacheKey(cacheKeyPrefix, cacheKeyBase);

      if (!force) {
        const cached = sharedCache.get(cacheKey) as CacheEntry<TItem> | undefined;
        if (cached) {
          setItems(cached.items);
          setTotal(cached.total);
          setError(null);
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true);
        const response = await fetchPage({
          ...params,
          page,
          limit: pageSize,
        });

        if (requestId !== latestRequestIdRef.current) {
          return;
        }

        setItems(response.items);
        setTotal(response.meta.total);
        sharedCache.set(cacheKey, {
          items: response.items,
          total: response.meta.total,
        });
        setError(null);
      } catch {
        if (requestId !== latestRequestIdRef.current) {
          return;
        }
        setError(errorMessage);
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [cacheKeyPrefix, errorMessage, fetchPage, page, pageSize, params],
  );

  return {
    items,
    total,
    loading,
    error,
    loadPage,
    invalidateCache,
  };
}
