import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, RefreshCw, Search } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { AlbumInfo, AlbumSortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { usePersistentState } from '../hooks/usePersistentState';
import { useSortState } from '../hooks/useSortState';
import { formatBytes, formatDate, formatDateTime } from '../utils/formatters';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';

const PAGE_SIZE = 50;

const getAlbumKey = (album: AlbumInfo) => album.album_key;

export function AlbumsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = usePersistentState('albums:search', '');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { sortBy, sortDirection, handleSortClick } = useSortState<AlbumSortBy>({
    initialSortBy: 'album_name',
    initialDirection: 'asc',
    getDefaultDirection: (column) => (column === 'album_name' ? 'asc' : 'desc'),
    storageKey: 'albums:sort',
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
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList({
    pageSize: PAGE_SIZE,
    params: queryParams,
    fetchPage: mp3Api.listAlbumsPaged,
    getKey: getAlbumKey,
    errorMessage: 'Failed to load albums',
  });

  const player = usePlayer();
  const currentAlbumName = (player.currentTrack?.album || '').trim().toLowerCase();

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

  const formatArtists = (album: AlbumInfo) => (album.artists.length > 0 ? album.artists.join(', ') : '-');

  const columns: DataTableColumn<AlbumInfo>[] = [
    {
      key: 'cover',
      header: <span className="sr-only">Cover</span>,
      width: '76px',
      render: (album) => (
        <div className="library-cover-sm">
          <CoverPlayButton
            src={album.has_cover ? mp3Api.getAlbumCoverUrl(album.album_key, 'thumb') : undefined}
            label={`Play ${album.album_name}`}
            isCurrent={player.currentTrack !== null && currentAlbumName === album.album_name.toLowerCase()}
            isPlaying={player.state.isPlaying}
            onPlay={() => void player.playAlbum(album.album_key)}
            onToggle={player.togglePlay}
          />
        </div>
      ),
    },
    {
      key: 'album',
      header: renderSortHeader('album_name', 'Album'),
      render: (album) => (
        <>
          <span className="table-cell-ellipsis" title={album.album_name || '(No Album)'}>{album.album_name || '(No Album)'}</span>
          {album.artists.length > 0 && (
            <span className="table-cell-subtitle" title={formatArtists(album)}>{formatArtists(album)}</span>
          )}
        </>
      ),
    },
    {
      key: 'artists',
      header: 'Artists',
      hideBelow: 'sm',
      render: (album) => <span className="table-cell-ellipsis" title={formatArtists(album)}>{formatArtists(album)}</span>,
    },
    {
      key: 'tracks',
      header: renderSortHeader('track_count', 'Tracks'),
      width: '90px',
      hideBelow: 'sm',
      render: (album) => <span className="table-cell-ellipsis" title={String(album.track_count)}>{album.track_count}</span>,
    },
    {
      key: 'size',
      header: renderSortHeader('total_size', 'Size'),
      width: '110px',
      hideBelow: 'md',
      render: (album) => <span className="table-cell-ellipsis" title={formatBytes(album.total_size)}>{formatBytes(album.total_size)}</span>,
    },
    {
      key: 'date_added',
      header: renderSortHeader('date_added', 'Date Added'),
      width: '128px',
      hideBelow: 'sm',
      render: (album) => <span className="library-date" title={formatDateTime(album.date_added)}>{formatDate(album.date_added)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '72px',
      render: (album) => (
        <div className="table-actions">
          <IconButton
            icon={Pencil}
            label="Edit album"
            size="sm"
            onClick={() => navigate(`/albums/${encodeURIComponent(album.album_key)}`)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="page page--fill">
      {error && <p className="error">{error}</p>}

      <DataTable
        fill
        columns={columns}
        items={albums}
        getRowKey={getAlbumKey}
        emptyMessage={debouncedSearchQuery.trim() ? 'No matches' : 'No albums yet'}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onEndReached={loadMore}
        resetKey={queryParams}
        toolbar={(
          <>
            <IconField
              icon={Search}
              label="Search"
              className="library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => void refresh()} />
            <span className="library-count">{albums.length} / {totalItems}</span>
          </>
        )}
      />
    </div>
  );
}
