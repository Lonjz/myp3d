import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

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
    <div className="paginated-table">
      <div className="library-table-wrap glass glass--strong">
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
          {shownStart}–{shownEnd} of {totalItems}
        </p>

        <div className="pagination-buttons">
          <IconButton icon={ChevronLeft} label="Previous page" size="sm" onClick={onPrevious} disabled={previousDisabled} />
          <span className="pagination-page">
            {currentPage} / {totalPages}
          </span>
          <IconButton icon={ChevronRight} label="Next page" size="sm" onClick={onNext} disabled={nextDisabled} />
        </div>

        {onGoToPage && (
          <form className="pagination-jump" onSubmit={handleGoToPage} noValidate>
            <input
              id="paginationJumpInput"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              disabled={jumpDisabled}
              aria-label="Page number"
              placeholder="Page"
            />
            <IconButton icon={ArrowRight} label="Go to page" size="sm" type="submit" disabled={goDisabled} />
          </form>
        )}
      </div>
    </div>
  );
}
