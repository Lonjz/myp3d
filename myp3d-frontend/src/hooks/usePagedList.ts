import { useEffect, useState } from 'react';
import { usePagedData, type PagedResponse } from './usePagedData';

type UsePagedListOptions<TParams extends Record<string, unknown>, TItem> = {
  pageSize: number;
  params: TParams;
  fetchPage: (params: TParams & { page: number; limit: number }) => Promise<PagedResponse<TItem>>;
  errorMessage: string;
  cacheKeyPrefix: string;
  resetKey: string;
};

export function usePagedList<TParams extends Record<string, unknown>, TItem>({
  pageSize,
  params,
  fetchPage,
  errorMessage,
  cacheKeyPrefix,
  resetKey,
}: UsePagedListOptions<TParams, TItem>) {
  const [currentPage, setCurrentPage] = useState(1);

  const { items, total, loading, error, loadPage, invalidateCache } = usePagedData({
    page: currentPage,
    pageSize,
    params,
    fetchPage,
    errorMessage,
    cacheKeyPrefix,
  });

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
