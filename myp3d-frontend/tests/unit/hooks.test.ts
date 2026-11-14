import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCoverImageCrop } from '../../src/components/cover/useCoverImageCrop';
import { useInfiniteList } from '../../src/hooks/useInfiniteList';
import { useSelection } from '../../src/hooks/useSelection';
import { useSortState } from '../../src/hooks/useSortState';

describe('useInfiniteList', () => {
  it('reloads every loaded page in one request', async () => {
    const all = Array.from({ length: 10 }, (_, index) => `item ${index}`);
    const fetchPage = vi.fn(async ({ page, limit }: { page: number; limit: number }) => ({
      items: all.slice((page - 1) * limit, page * limit),
      meta: { total: all.length },
    }));
    const params = {};
    const { result } = renderHook(() => useInfiniteList({ pageSize: 2, params, fetchPage, getKey: (item: string) => item }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(result.current.items).toHaveLength(6);

    fetchPage.mockClear();
    await act(() => result.current.refresh());
    expect(fetchPage.mock.calls).toEqual([[{ page: 1, limit: 6 }]]);
    expect(result.current.items).toEqual(all.slice(0, 6));
    expect(result.current.hasMore).toBe(true);
  });
});

describe('useSelection', () => {
  it('toggles keys, selects all and drops removed ones', () => {
    const { result, rerender } = renderHook(({ keys }) => useSelection(keys), { initialProps: { keys: ['a', 'b', 'c'] } });
    act(() => result.current.toggle('b'));
    expect(result.current.chosen).toEqual(['b']);
    act(() => result.current.toggleAll());
    expect(result.current.allChosen).toBe(true);
    act(() => result.current.drop(['a']));
    expect(result.current.chosen).toEqual(['b', 'c']);
    rerender({ keys: ['c', 'd'] });
    expect(result.current.chosen).toEqual(['c']);
    act(() => result.current.toggleAll());
    expect(result.current.chosen).toEqual(['c', 'd']);
  });
});

describe('useSortState', () => {
  it('flips direction on the same column and uses the default for a new one', () => {
    const { result } = renderHook(() =>
      useSortState<'title' | 'size'>({ initialSortBy: 'title', initialDirection: 'asc', getDefaultDirection: (column) => (column === 'size' ? 'desc' : 'asc'), storageKey: 'sort-test' }),
    );
    act(() => result.current.handleSortClick('title'));
    expect([result.current.sortBy, result.current.sortDirection]).toEqual(['title', 'desc']);
    act(() => result.current.handleSortClick('size'));
    expect([result.current.sortBy, result.current.sortDirection]).toEqual(['size', 'desc']);
  });
});

describe('useCoverImageCrop', () => {
  it('opens the crop for a large square image', async () => {
    class LoadedImage {
      naturalWidth = 1200;
      naturalHeight = 1200;
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadedImage);
    const { result } = renderHook(() => useCoverImageCrop({ onError: () => undefined }));
    await act(() => result.current.handleCoverFileSelect(new File(['square'], 'square.png', { type: 'image/png' })));
    expect(result.current.isCropModalOpen).toBe(true);
    expect(result.current.coverImageBase64).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
