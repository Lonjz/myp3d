import type { ReactNode } from 'react';

interface PaginatedTableProps {
  tableClassName?: string;
  colGroup?: ReactNode;
  emptyColSpan: number;
  hasRows: boolean;
  emptyMessage: string;
  headerRow: ReactNode;
  rowContent: ReactNode;
  shownStart: number;
  shownEnd: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
}

export function PaginatedTable({
  tableClassName,
  colGroup,
  emptyColSpan,
  hasRows,
  emptyMessage,
  headerRow,
  rowContent,
  shownStart,
  shownEnd,
  totalItems,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: PaginatedTableProps) {
  return (
    <div>
      <div className="library-table-wrap">
        <table className={`library-table ${tableClassName || ''}`.trim()}>
          {colGroup}
          <thead>{headerRow}</thead>
          <tbody>
            {hasRows ? (
              rowContent
            ) : (
              <tr>
                <td colSpan={emptyColSpan} className="library-empty-row">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="library-pagination">
        <p>
          Showing {shownStart}-{shownEnd} of {totalItems}
        </p>
        <div className="pagination-buttons">
          <button className="btn-secondary" onClick={onPrevious} disabled={previousDisabled}>
            Previous
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button className="btn-secondary" onClick={onNext} disabled={nextDisabled}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
