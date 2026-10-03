import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from '../ui/Spinner';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: string;
  hideBelow?: 'md' | 'sm';
  render: (item: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  items: T[];
  getRowKey: (item: T) => string;
  getRowClassName?: (item: T) => string | undefined;
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

export function DataTable<T>({
  columns,
  items,
  getRowKey,
  getRowClassName,
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

  useEffect(() => {
    const scroller = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!scroller || !sentinel || !onEndReached || !hasMore || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onEndReached();
        }
      },
      { root: scroller, rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onEndReached]);

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

  return (
    <div className={fill ? 'data-table data-table--fill' : 'data-table'}>
      {toolbar && <div className="library-toolbar glass">{toolbar}</div>}

      <div className="library-table-wrap glass glass--strong">
        <div
          ref={scrollRef}
          className="library-table-scroll"
          onScroll={(event) => {
            scrollTopRef.current = event.currentTarget.scrollTop;
          }}
        >
          <table className={`library-table ${className ?? ''}`.trim()}>
            <colgroup>
              {columns.map((column) => (
                <col
                  key={column.key}
                  data-hide={column.hideBelow}
                  style={column.width ? { width: column.width } : undefined}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} data-hide={column.hideBelow}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item, index) => (
                  <tr key={getRowKey(item)} className={getRowClassName?.(item)}>
                    {columns.map((column) => (
                      <td key={column.key} data-hide={column.hideBelow}>
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
