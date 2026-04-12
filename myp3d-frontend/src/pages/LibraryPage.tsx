import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';
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

type FilterBy = 'all' | 'title' | 'artist' | 'filename' | 'album';
type SortBy = 'date_added' | 'filename' | 'size' | 'artist' | 'title' | 'album';
type SortDirection = 'asc' | 'desc';

export function LibraryPage() {
  const navigate = useNavigate();
  const [mp3s, setMp3s] = useState<MP3Info[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [sortBy, setSortBy] = useState<SortBy>('date_added');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const sortColumnLabels: Record<SortBy, string> = {
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    filename: 'File Name',
    size: 'Size',
    date_added: 'Date Added',
  };

  const loadMp3s = async () => {
    try {
      setLoading(true);
      const list = await mp3Api.listAll();
      setMp3s(list);
      setError(null);
    } catch (err) {
      setError('Failed to load MP3 library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMp3s();
  }, []);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await mp3Api.delete(filename);
      loadMp3s();
    } catch {
      alert('Failed to delete file');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredMp3s = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return mp3s;
    }

    return mp3s.filter((mp3) => {
      const title = (mp3.title || '').toLowerCase();
      const artist = (mp3.artist || '').toLowerCase();
      const album = (mp3.album || '').toLowerCase();
      const filename = mp3.filename.toLowerCase();

      if (filterBy === 'title') return title.includes(query);
      if (filterBy === 'artist') return artist.includes(query);
      if (filterBy === 'filename') return filename.includes(query);
      if (filterBy === 'album') return album.includes(query);
      return (
        title.includes(query) ||
        artist.includes(query) ||
        album.includes(query) ||
        filename.includes(query)
      );
    });
  }, [mp3s, searchQuery, filterBy]);

  const sortedMp3s = useMemo(() => {
    const sorted = [...filteredMp3s];
    sorted.sort((a, b) => {
      const normalizeText = (value: string | null | undefined) => (value || '').toLowerCase();

      let comparison = 0;
      if (sortBy === 'date_added') {
        const aDate = a.date_added ? new Date(a.date_added).getTime() : 0;
        const bDate = b.date_added ? new Date(b.date_added).getTime() : 0;
        comparison = aDate - bDate;
      } else if (sortBy === 'size') {
        comparison = a.file_size - b.file_size;
      } else if (sortBy === 'artist') {
        comparison = normalizeText(a.artist).localeCompare(normalizeText(b.artist));
      } else if (sortBy === 'title') {
        comparison = normalizeText(a.title).localeCompare(normalizeText(b.title));
      } else if (sortBy === 'album') {
        comparison = normalizeText(a.album).localeCompare(normalizeText(b.album));
      } else {
        comparison = normalizeText(a.filename).localeCompare(normalizeText(b.filename));
      }

      if (comparison === 0) {
        comparison = normalizeText(a.filename).localeCompare(normalizeText(b.filename));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredMp3s, sortBy, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterBy, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedMp3s.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedMp3s = sortedMp3s.slice(pageStart, pageEnd);
  const shownStart = sortedMp3s.length === 0 ? 0 : pageStart + 1;
  const shownEnd = Math.min(pageEnd, sortedMp3s.length);

  const formatDateAdded = (dateAdded: string | null | undefined) => {
    if (!dateAdded) return '-';
    const parsed = new Date(dateAdded);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  };

  const handleSortClick = (column: SortBy) => {
    if (column === sortBy) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(column === 'date_added' ? 'desc' : 'asc');
  };

  const renderSortHeader = (column: SortBy) => {
    return (
      <SortableHeaderButton
        label={sortColumnLabels[column]}
        isActive={sortBy === column}
        sortDirection={sortDirection}
        onClick={() => handleSortClick(column)}
      />
    );
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>MP3 Library</h1>
      <div className="library-toolbar">
        <button onClick={loadMp3s} className="btn-secondary">
          Refresh
        </button>

        <div className="library-filters">
          <div className="form-group library-filter-group">
            <label htmlFor="libraryFilterBy">Filter By</label>
            <select
              id="libraryFilterBy"
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as FilterBy)}
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

      {mp3s.length === 0 ? (
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
          hasRows={pagedMp3s.length > 0}
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
          rowContent={pagedMp3s.map((mp3) => (
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
          totalItems={sortedMp3s.length}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          previousDisabled={currentPage <= 1}
          nextDisabled={currentPage >= totalPages}
        />
      )}
    </div>
  );
}
