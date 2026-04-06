import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumInfo } from '../api/mp3Api';

const PAGE_SIZE = 20;

type SortBy = 'album_name' | 'track_count' | 'total_size' | 'date_added';
type SortDirection = 'asc' | 'desc';

export function AlbumsPage() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('album_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const loadAlbums = async () => {
    try {
      setLoading(true);
      const list = await mp3Api.listAlbums();
      setAlbums(list);
      setError(null);
    } catch {
      setError('Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, []);

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

  const filteredAlbums = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return albums;

    return albums.filter((album) => {
      const albumName = (album.album_name || '').toLowerCase();
      const artistList = album.artists.join(' ').toLowerCase();
      return albumName.includes(query) || artistList.includes(query);
    });
  }, [albums, searchQuery]);

  const sortedAlbums = useMemo(() => {
    const list = [...filteredAlbums];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'track_count') {
        comparison = a.track_count - b.track_count;
      } else if (sortBy === 'total_size') {
        comparison = a.total_size - b.total_size;
      } else if (sortBy === 'date_added') {
        const aDate = a.date_added ? new Date(a.date_added).getTime() : 0;
        const bDate = b.date_added ? new Date(b.date_added).getTime() : 0;
        comparison = aDate - bDate;
      } else {
        comparison = (a.album_name || '').toLowerCase().localeCompare((b.album_name || '').toLowerCase());
      }

      if (comparison === 0) {
        comparison = (a.album_name || '').toLowerCase().localeCompare((b.album_name || '').toLowerCase());
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [filteredAlbums, sortBy, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedAlbums.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedAlbums = sortedAlbums.slice(pageStart, pageEnd);
  const shownStart = sortedAlbums.length === 0 ? 0 : pageStart + 1;
  const shownEnd = Math.min(pageEnd, sortedAlbums.length);

  const handleSortClick = (column: SortBy) => {
    if (column === sortBy) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(column === 'album_name' ? 'asc' : 'desc');
  };

  const renderSortHeader = (column: SortBy, label: string) => {
    const isActive = sortBy === column;
    const indicator = sortDirection === 'asc' ? '↑' : '↓';

    return (
      <button
        type="button"
        className={`library-sort-button ${isActive ? 'active' : ''}`}
        onClick={() => handleSortClick(column)}
      >
        <span>{label}</span>
        {isActive && <span className="library-sort-indicator" aria-hidden="true">{indicator}</span>}
      </button>
    );
  };

  if (loading) return <div className="page"><p>Loading albums...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>Albums</h1>
      <div className="library-toolbar">
        <button onClick={loadAlbums} className="btn-secondary">
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

      {albums.length === 0 ? (
        <p>No albums found yet. Add album metadata to your tracks.</p>
      ) : (
        <div>
          <div className="library-table-wrap">
            <table className="library-table albums-table">
              <thead>
                <tr>
                  <th>Cover</th>
                  <th>{renderSortHeader('album_name', 'Album')}</th>
                  <th>Artists</th>
                  <th>{renderSortHeader('track_count', 'Tracks')}</th>
                  <th>{renderSortHeader('total_size', 'Size')}</th>
                  <th>{renderSortHeader('date_added', 'Date Added')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedAlbums.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="library-empty-row">
                      No results for this search.
                    </td>
                  </tr>
                ) : (
                  pagedAlbums.map((album) => (
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
                      <td>{album.album_name || '(No Album)'}</td>
                      <td>{album.artists.length > 0 ? album.artists.join(', ') : '-'}</td>
                      <td>{album.track_count}</td>
                      <td>{formatSize(album.total_size)}</td>
                      <td className="library-date">{formatDateAdded(album.date_added)}</td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="library-pagination">
            <p>
              Showing {shownStart}-{shownEnd} of {sortedAlbums.length}
            </p>
            <div className="pagination-buttons">
              <button
                className="btn-secondary"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                Previous
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="btn-secondary"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
