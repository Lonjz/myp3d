import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

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
  onGoToPage?: (page: number) => void;
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
  onGoToPage,
  previousDisabled,
  nextDisabled,
}: PaginatedTableProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const trimmedPageInput = pageInput.trim();
  const parsedPage = /^\d+$/.test(trimmedPageInput) ? Number(trimmedPageInput) : Number.NaN;
  const isValidJumpInput = Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= totalPages;

  const handleGoToPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onGoToPage || !isValidJumpInput || parsedPage === currentPage) {
      return;
    }

    onGoToPage(parsedPage);
  };

  const jumpDisabled = totalPages <= 1 || (previousDisabled && nextDisabled);
  const goDisabled = jumpDisabled || !isValidJumpInput || parsedPage === currentPage;

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
        <p className="pagination-summary">
          Showing {shownStart}-{shownEnd} of {totalItems}
        </p>

        <div className="pagination-jump-center">
          {onGoToPage && (
            <form className="pagination-jump" onSubmit={handleGoToPage} noValidate>
              <label htmlFor="paginationJumpInput">Go to</label>
              <input
                id="paginationJumpInput"
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                disabled={jumpDisabled}
              />
              <button type="submit" className="btn-secondary" disabled={goDisabled}>
                Go
              </button>
            </form>
          )}
        </div>

        <div className="pagination-buttons">
          <button className="btn-secondary" onClick={onPrevious} disabled={previousDisabled}>
            Prev
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
