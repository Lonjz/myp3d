import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3FilterBy, MP3Info, MP3SortBy, SortDirection } from '../api/mp3Api';
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
  const [mp3s, setMp3s] = useState<MP3Info[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<MP3FilterBy>('all');
  const [sortBy, setSortBy] = useState<MP3SortBy>('date_added');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const latestRequestIdRef = useRef(0);

  const sortColumnLabels: Record<MP3SortBy, string> = {
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    filename: 'File Name',
    size: 'Size',
    date_added: 'Date Added',
  };

  const loadMp3s = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    try {
      setLoading(true);
      const response = await mp3Api.listAllPaged({
        page: currentPage,
        limit: PAGE_SIZE,
        search: debouncedSearchQuery,
        filterBy,
        sortBy,
        sortDirection,
      });

      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      setMp3s(response.items);
      setTotalItems(response.meta.total);
      setError(null);
    } catch {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setError('Failed to load MP3 library');
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, debouncedSearchQuery, filterBy, sortBy, sortDirection]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [searchQuery]);

  useEffect(() => {
    void loadMp3s();
  }, [loadMp3s]);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await mp3Api.delete(filename);
      await loadMp3s();
    } catch {
      alert('Failed to delete file');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

  const formatDateAdded = (dateAdded: string | null | undefined) => {
    if (!dateAdded) return '-';
    const parsed = new Date(dateAdded);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  };

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
        <button onClick={() => void loadMp3s()} className="btn-secondary">
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
              <td><span className="table-cell-ellipsis" title={formatSize(mp3.file_size)}>{formatSize(mp3.file_size)}</span></td>
              <td><span className="library-date" title={formatDateAdded(mp3.date_added)}>{formatDateAdded(mp3.date_added)}</span></td>
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
