import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3FilterBy, MP3SortBy, SortDirection } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePagedData } from '../hooks/usePagedData';
import { formatBytes, formatDateTime } from '../utils/formatters';
import { PaginatedTable } from '../components/table/PaginatedTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';

const PAGE_SIZE = 25;
const LIBRARY_COLUMN_WIDTHS = {
  cover: '76px',
  title: '18%',
  artist: '14%',
  album: '14%',
  filename: '21%',
  size: '96px',
  dateAdded: '176px',
  actions: '210px',
} as const;

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<MP3FilterBy>('all');
  const [sortBy, setSortBy] = useState<MP3SortBy>('date_added');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const queryParams = useMemo(
    () => ({
      search: debouncedSearchQuery,
      filterBy,
      sortBy,
      sortDirection,
    }),
    [debouncedSearchQuery, filterBy, sortBy, sortDirection],
  );

  const {
    items: mp3s,
    total: totalItems,
    loading,
    error,
    loadPage: loadMp3s,
    invalidateCache: invalidateMp3Cache,
  } = usePagedData({
    page: currentPage,
    pageSize: PAGE_SIZE,
    params: queryParams,
    fetchPage: mp3Api.listAllPaged,
    errorMessage: 'Failed to load MP3 library',
    cacheKeyPrefix: 'library',
  });

  const sortColumnLabels: Record<MP3SortBy, string> = {
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    filename: 'File Name',
    size: 'Size',
    date_added: 'Date Added',
  };

  useEffect(() => {
    void loadMp3s();
  }, [loadMp3s]);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await mp3Api.delete(filename);
      invalidateMp3Cache();
      await loadMp3s({ force: true });
    } catch {
      alert('Failed to delete file');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterBy, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const shownStart = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const shownEnd = totalItems === 0 ? 0 : shownStart + mp3s.length - 1;

  const handleSortClick = (column: MP3SortBy) => {
    if (column === sortBy) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(column === 'date_added' ? 'desc' : 'asc');
  };

  const renderSortHeader = (column: MP3SortBy) => {
    return (
      <SortableHeaderButton
        label={sortColumnLabels[column]}
        isActive={sortBy === column}
        sortDirection={sortDirection}
        onClick={() => handleSortClick(column)}
      />
    );
  };

  if (loading && mp3s.length === 0) return <div className="page"><p>Loading...</p></div>;
  if (error && mp3s.length === 0) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>MP3 Library</h1>
      <div className="library-toolbar">
        <button onClick={() => void loadMp3s({ force: true })} className="btn-secondary">
          Refresh
        </button>

        <div className="library-filters">
          <div className="form-group library-filter-group">
            <label htmlFor="libraryFilterBy">Filter By</label>
            <select
              id="libraryFilterBy"
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as MP3FilterBy)}
            >
              <option value="all">All</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="filename">File Name</option>
            </select>
          </div>

          <div className="form-group library-search-group">
            <label htmlFor="librarySearch">Search</label>
            <input
              id="librarySearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, artist, filename..."
            />
          </div>

        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {totalItems === 0 ? (
        <p>No MP3 files yet. Download some!</p>
      ) : (
        <PaginatedTable
          colGroup={(
            <colgroup>
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.cover }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.title }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.artist }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.album }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.filename }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.size }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.dateAdded }} />
              <col style={{ width: LIBRARY_COLUMN_WIDTHS.actions }} />
            </colgroup>
          )}
          emptyColSpan={8}
          hasRows={mp3s.length > 0}
          emptyMessage="No results for this search."
          headerRow={(
            <tr>
              <th>Cover</th>
              <th>{renderSortHeader('title')}</th>
              <th>{renderSortHeader('artist')}</th>
              <th>{renderSortHeader('album')}</th>
              <th>{renderSortHeader('filename')}</th>
              <th>{renderSortHeader('size')}</th>
              <th>{renderSortHeader('date_added')}</th>
              <th>Actions</th>
            </tr>
          )}
          rowContent={mp3s.map((mp3) => (
            <tr key={mp3.filename}>
              <td>
                <div className="library-cover-sm">
                  {mp3.has_cover ? (
                    <img src={mp3Api.getCoverUrl(mp3.filename)} alt="Cover" />
                  ) : (
                    <div className="no-cover">🎵</div>
                  )}
                </div>
              </td>
              <td><span className="table-cell-ellipsis" title={mp3.title || '-'}>{mp3.title || '-'}</span></td>
              <td><span className="table-cell-ellipsis" title={mp3.artist || '-'}>{mp3.artist || '-'}</span></td>
              <td><span className="table-cell-ellipsis" title={mp3.album || '-'}>{mp3.album || '-'}</span></td>
              <td><span className="library-filename" title={mp3.filename}>{mp3.filename}</span></td>
              <td><span className="table-cell-ellipsis" title={formatBytes(mp3.file_size)}>{formatBytes(mp3.file_size)}</span></td>
              <td><span className="library-date" title={formatDateTime(mp3.date_added)}>{formatDateTime(mp3.date_added)}</span></td>
              <td>
                <div className="table-actions">
                  <button
                    onClick={() => navigate(`/details/${encodeURIComponent(mp3.filename)}`)}
                    className="btn-secondary btn-small"
                  >
                    Edit
                  </button>
                  <a href={mp3Api.getFileUrl(mp3.filename)} download className="btn-secondary btn-small">
                    Download
                  </a>
                  <button onClick={() => handleDelete(mp3.filename)} className="btn-danger btn-small">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          shownStart={shownStart}
          shownEnd={shownEnd}
          totalItems={totalItems}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          onGoToPage={(page) => setCurrentPage(page)}
          previousDisabled={currentPage <= 1 || loading}
          nextDisabled={currentPage >= totalPages || loading}
        />
      )}
    </div>
  );
}
