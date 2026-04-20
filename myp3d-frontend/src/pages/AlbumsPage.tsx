import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumInfo, AlbumSortBy, SortDirection } from '../api/mp3Api';
import { PaginatedTable } from '../components/table/PaginatedTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';

const PAGE_SIZE = 20;
const ALBUM_COLUMN_WIDTHS = {
  cover: '76px',
  album: '24%',
  artists: '22%',
  tracks: '90px',
  size: '110px',
  dateAdded: '176px',
  actions: '160px',
} as const;

export function AlbumsPage() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<AlbumSortBy>('album_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const latestRequestIdRef = useRef(0);

  const loadAlbums = useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;

    try {
      setLoading(true);
      const response = await mp3Api.listAlbumsPaged({
        page: currentPage,
        limit: PAGE_SIZE,
        search: debouncedSearchQuery,
        sortBy,
        sortDirection,
      });

      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      setAlbums(response.items);
      setTotalItems(response.meta.total);
      setError(null);
    } catch {
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setError('Failed to load albums');
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, debouncedSearchQuery, sortBy, sortDirection]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [searchQuery]);

  useEffect(() => {
    void loadAlbums();
  }, [loadAlbums]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDateAdded = (dateAdded: string | null | undefined) => {
    if (!dateAdded) return '-';
    const parsed = new Date(dateAdded);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const shownStart = totalItems === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const shownEnd = totalItems === 0 ? 0 : shownStart + albums.length - 1;

  const handleSortClick = (column: AlbumSortBy) => {
    if (column === sortBy) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(column === 'album_name' ? 'asc' : 'desc');
  };

  const renderSortHeader = (column: AlbumSortBy, label: string) => {
    return (
      <SortableHeaderButton
        label={label}
        isActive={sortBy === column}
        sortDirection={sortDirection}
        onClick={() => handleSortClick(column)}
      />
    );
  };

  if (loading && albums.length === 0) return <div className="page"><p>Loading albums...</p></div>;
  if (error && albums.length === 0) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>Albums</h1>
      <div className="library-toolbar">
        <button onClick={() => void loadAlbums()} className="btn-secondary">
          Refresh
        </button>
        <div className="library-filters albums-filters">
          <div className="form-group library-search-group">
            <label htmlFor="albumsSearch">Search Albums / Artists</label>
            <input
              id="albumsSearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search album name or artist"
            />
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {totalItems === 0 ? (
        <p>No albums found yet. Add album metadata to your tracks.</p>
      ) : (
        <PaginatedTable
          tableClassName="albums-table"
          colGroup={(
            <colgroup>
              <col style={{ width: ALBUM_COLUMN_WIDTHS.cover }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.album }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.artists }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.tracks }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.size }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.dateAdded }} />
              <col style={{ width: ALBUM_COLUMN_WIDTHS.actions }} />
            </colgroup>
          )}
          emptyColSpan={7}
          hasRows={albums.length > 0}
          emptyMessage="No results for this search."
          headerRow={(
            <tr>
              <th>Cover</th>
              <th>{renderSortHeader('album_name', 'Album')}</th>
              <th>Artists</th>
              <th>{renderSortHeader('track_count', 'Tracks')}</th>
              <th>{renderSortHeader('total_size', 'Size')}</th>
              <th>{renderSortHeader('date_added', 'Date Added')}</th>
              <th>Actions</th>
            </tr>
          )}
          rowContent={albums.map((album) => (
            <tr key={album.album_key}>
              <td>
                <div className="library-cover-sm">
                  {album.has_cover ? (
                    <img src={mp3Api.getAlbumCoverUrl(album.album_key)} alt="Album cover" />
                  ) : (
                    <div className="no-cover">🎵</div>
                  )}
                </div>
              </td>
              <td><span className="table-cell-ellipsis" title={album.album_name || '(No Album)'}>{album.album_name || '(No Album)'}</span></td>
              <td><span className="table-cell-ellipsis" title={album.artists.length > 0 ? album.artists.join(', ') : '-'}>{album.artists.length > 0 ? album.artists.join(', ') : '-'}</span></td>
              <td><span className="table-cell-ellipsis" title={String(album.track_count)}>{album.track_count}</span></td>
              <td><span className="table-cell-ellipsis" title={formatSize(album.total_size)}>{formatSize(album.total_size)}</span></td>
              <td><span className="library-date" title={formatDateAdded(album.date_added)}>{formatDateAdded(album.date_added)}</span></td>
              <td>
                <div className="table-actions">
                  <button
                    className="btn-secondary btn-small"
                    onClick={() => navigate(`/albums/${encodeURIComponent(album.album_key)}`)}
                  >
                    Edit Album
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
          previousDisabled={currentPage <= 1 || loading}
          nextDisabled={currentPage >= totalPages || loading}
        />
      )}
    </div>
  );
}
