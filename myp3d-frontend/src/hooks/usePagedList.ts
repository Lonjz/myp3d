import { useEffect, useRef } from 'react';
import { usePagedData, type PagedResponse } from './usePagedData';
import { usePersistentState } from './usePersistentState';
import { subscribeAppEvent } from '../utils/appEvents';

type UsePagedListOptions<TParams extends Record<string, unknown>, TItem> = {
  pageSize: number;
  params: TParams;
  fetchPage: (params: TParams & { page: number; limit: number }) => Promise<PagedResponse<TItem>>;
  errorMessage: string;
  cacheKeyPrefix: string;
  resetKey: string;
  storageKey?: string;
};

export function usePagedList<TParams extends Record<string, unknown>, TItem>({
  pageSize,
  params,
  fetchPage,
  errorMessage,
  cacheKeyPrefix,
  resetKey,
  storageKey,
}: UsePagedListOptions<TParams, TItem>) {
  const [currentPage, setCurrentPage] = usePersistentState(storageKey ?? null, 1);
  const prevResetKeyRef = useRef(resetKey);

  const { items, total, loading, error, loadPage, invalidateCache } = usePagedData({
    page: currentPage,
    pageSize,
    params,
    fetchPage,
    errorMessage,
    cacheKeyPrefix,
  });

  useEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }
    void loadPage();
  }, [loadPage, currentPage, resetKey, setCurrentPage]);

  useEffect(() => subscribeAppEvent('library-changed', () => void loadPage({ force: true })), [loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!loading && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, loading, totalPages, setCurrentPage]);

  const shownStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const shownEnd = total === 0 ? 0 : shownStart + items.length - 1;

  return {
    items,
    total,
    loading,
    error,
    loadPage,
    invalidateCache,
    currentPage,
    totalPages,
    shownStart,
    shownEnd,
    onPrevious: () => setCurrentPage((prev) => Math.max(1, prev - 1)),
    onNext: () => setCurrentPage((prev) => Math.min(totalPages, prev + 1)),
    onGoToPage: (page: number) => setCurrentPage(page),
    previousDisabled: currentPage <= 1 || loading,
    nextDisabled: currentPage >= totalPages || loading,
  };
}
