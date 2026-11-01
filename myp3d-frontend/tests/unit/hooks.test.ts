import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCoverImageCrop } from '../../src/components/cover/useCoverImageCrop';
import { useSelection } from '../../src/hooks/useSelection';
import { useSortState } from '../../src/hooks/useSortState';

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
