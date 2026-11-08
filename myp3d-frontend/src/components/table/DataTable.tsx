import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { ListChecks, Play, X } from 'lucide-react';
import { useEndReached } from '../../hooks/useInfiniteList';
import { cx } from '../../utils/formatters';
import { rowOpenProps } from '../../utils/rowOpen';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: string;
  hideBelow?: 'md' | 'sm';
  noRowOpen?: boolean;
  render: (item: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  items: T[];
  getRowKey: (item: T) => string;
  getRowClassName?: (item: T) => string | undefined;
  getRowProps?: (item: T, index: number) => HTMLAttributes<HTMLTableRowElement>;
  onRowOpen?: (item: T) => void;
  onRowMenu?: (item: T, event: MouseEvent<HTMLTableRowElement>) => void;
  emptyMessage: string;
  className?: string;
  fill?: boolean;
  toolbar?: ReactNode;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onEndReached?: () => void;
  resetKey?: unknown;
}

interface SelectionToolbarProps {
  count: number;
  state: string;
  onClear: () => void;
  onPlay: () => void;
  children: ReactNode;
}

export function SelectionToolbar({ count, state, onClear, onPlay, children }: SelectionToolbarProps) {
  return (
    <div className="library-toolbar__set" data-state={state}>
      <IconButton icon={X} label="Clear selection" onClick={onClear} />
      <span className="library-selection-count" title="Selected">
        <ListChecks aria-hidden="true" />
        {count}
      </span>
      <IconButton icon={Play} label="Play selected" onClick={onPlay} />
      {children}
    </div>
  );
}

export function DataTable<T>({
  columns,
  items,
  getRowKey,
  getRowClassName,
  getRowProps,
  onRowOpen,
  onRowMenu,
  emptyMessage,
  className,
  fill = false,
  toolbar,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onEndReached,
  resetKey,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const resetKeyRef = useRef(resetKey);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && scrollTopRef.current > 0) {
      scroller.scrollTop = scrollTopRef.current;
    }
  }, []);

  useEndReached(scrollRef, sentinelRef, onEndReached, hasMore && !loadingMore);

  useEffect(() => {
    if (resetKeyRef.current === resetKey) {
      return;
    }

    resetKeyRef.current = resetKey;
    scrollTopRef.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  const tableClassName = cx('library-table', className);
  const colgroup = (
    <colgroup>
      {columns.map((column) => (
        <col
          key={column.key}
          data-hide={column.hideBelow}
          style={column.width ? { width: column.width } : undefined}
        />
      ))}
    </colgroup>
  );

  return (
    <div className={fill ? 'data-table data-table--fill' : 'data-table'}>
      {toolbar && <div className="library-toolbar glass">{toolbar}</div>}

      <div className="library-table-wrap glass glass--strong">
        <div className="library-table-head">
          <table className={tableClassName}>
            {colgroup}
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} data-hide={column.hideBelow}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        <div
          ref={scrollRef}
          className="library-table-scroll"
          onScroll={(event) => {
            scrollTopRef.current = event.currentTarget.scrollTop;
          }}
        >
          <table className={tableClassName}>
            {colgroup}
            <tbody>
              {items.length > 0 ? (
                items.map((item, index) => (
                  <tr
                    key={getRowKey(item)}
                    {...getRowProps?.(item, index)}
                    {...(onRowOpen ? rowOpenProps<HTMLTableRowElement>(() => onRowOpen(item)) : undefined)}
                    onContextMenu={onRowMenu ? (event) => onRowMenu(item, event) : undefined}
                    className={cx(getRowClassName?.(item), onRowOpen && 'is-clickable') || undefined}
                    style={{ '--row': index } as CSSProperties}
                  >
                    {columns.map((column) => (
                      <td key={column.key} data-hide={column.hideBelow} data-no-row-open={column.noRowOpen || undefined}>
                        {column.render(item, index)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="library-empty-row">
                    {loading ? <Spinner inline /> : emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {onEndReached && (
            <div className="data-table__footer">
              {loadingMore && <Spinner inline />}
              <div ref={sentinelRef} className="data-table__sentinel" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
