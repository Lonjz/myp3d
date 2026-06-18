import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumSortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePagedList } from '../hooks/usePagedList';
import { useSortState } from '../hooks/useSortState';
import { formatBytes, formatDateTime } from '../utils/formatters';
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
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { sortBy, sortDirection, handleSortClick } = useSortState<AlbumSortBy>({
    initialSortBy: 'album_name',
    initialDirection: 'asc',
    getDefaultDirection: (column) => (column === 'album_name' ? 'asc' : 'desc'),
  });

  const queryParams = useMemo(
    () => ({
      search: debouncedSearchQuery,
      sortBy,
      sortDirection,
    }),
    [debouncedSearchQuery, sortBy, sortDirection],
  );

  const {
    items: albums,
    total: totalItems,
    loading,
    error,
    loadPage: loadAlbums,
    currentPage,
    totalPages,
    shownStart,
    shownEnd,
    onPrevious,
    onNext,
    onGoToPage,
    previousDisabled,
    nextDisabled,
  } = usePagedList({
    pageSize: PAGE_SIZE,
    params: queryParams,
    fetchPage: mp3Api.listAlbumsPaged,
    errorMessage: 'Failed to load albums',
    cacheKeyPrefix: 'albums',
    resetKey: `${searchQuery}|${sortBy}|${sortDirection}`,
  });

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
        <button onClick={() => void loadAlbums({ force: true })} className="btn-secondary">
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
              <td><span className="table-cell-ellipsis" title={formatBytes(album.total_size)}>{formatBytes(album.total_size)}</span></td>
              <td><span className="library-date" title={formatDateTime(album.date_added)}>{formatDateTime(album.date_added)}</span></td>
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
          onPrevious={onPrevious}
          onNext={onNext}
          onGoToPage={onGoToPage}
          previousDisabled={previousDisabled}
          nextDisabled={nextDisabled}
        />
      )}
    </div>
  );
}
