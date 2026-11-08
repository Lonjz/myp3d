import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useEndReached, useInfiniteList } from '../../hooks/useInfiniteList';
import { subscribeAppEvent } from '../../utils/appEvents';
import { cx } from '../../utils/formatters';
import { LoadFailed } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';
import { IconField } from '../ui/IconField';
import { Spinner } from '../ui/Spinner';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface InfiniteSidebarListProps<T> {
  backLabel: string;
  onBack: () => void;
  activeKey: string;
  getItemKey: (item: T) => string;
  getItemTitle: (item: T) => string;
  getItemSubtitle: (item: T) => string;
  onSelect: (item: T) => void;
  fetchPage: (params: { search: string; page: number; limit: number }) => Promise<{ items: T[]; meta: { total: number } }>;
  pinnedItem: T;
}

export function InfiniteSidebarList<T>({
  backLabel,
  onBack,
  activeKey,
  getItemKey,
  getItemTitle,
  getItemSubtitle,
  onSelect,
  fetchPage,
  pinnedItem,
}: InfiniteSidebarListProps<T>) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const params = useMemo(() => ({ search }), [search]);
  const { items, total, loading, loadingMore, failed, hasMore, loadMore, refresh } = useInfiniteList({
    pageSize: PAGE_SIZE,
    params,
    fetchPage,
    getKey: getItemKey,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEndReached(listRef, sentinelRef, loadMore, hasMore && !loading && !loadingMore);
  useEffect(() => subscribeAppEvent('playlists-changed', () => void refresh()), [refresh]);

  const pinnedKey = getItemKey(pinnedItem);
  const visibleItems = items.some((item) => getItemKey(item) === pinnedKey) ? items : [pinnedItem, ...items];

  return (
    <aside className="details-sidebar glass">
      <div className="details-sidebar-header">
        <IconButton icon={ArrowLeft} label={backLabel} onClick={onBack} />
        <span className="details-sidebar-meta">{items.length} / {total}</span>
      </div>

      <IconField
        icon={Search}
        label="Search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
      />

      <div className="details-song-list" ref={listRef}>
        {visibleItems.map((item, index) => {
          const itemKey = getItemKey(item);
          const isActive = itemKey === activeKey;

          return (
            <button
              key={itemKey}
              type="button"
              className={cx('details-song-item', isActive && 'is-active')}
              style={{ '--row': index } as CSSProperties}
              onClick={() => onSelect(item)}
              disabled={isActive}
            >
              <span className="details-song-title">{getItemTitle(item)}</span>
              <span className="details-song-subtitle">{getItemSubtitle(item)}</span>
            </button>
          );
        })}

        {failed && !loading && !loadingMore && (
          <LoadFailed compact label="Couldn't load the list" onRetry={() => void refresh()} />
        )}

        {((loading && items.length === 0) || loadingMore) && <Spinner inline />}

        <div ref={sentinelRef} className="details-sidebar-sentinel" aria-hidden="true" />
      </div>
    </aside>
  );
}
