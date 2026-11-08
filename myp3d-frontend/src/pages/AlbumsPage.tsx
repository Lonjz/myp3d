import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, DiscAlbum, HardDrive, MicVocal, Music, RefreshCw, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { AlbumInfo, AlbumSortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { usePersistentState } from '../hooks/usePersistentState';
import { useSortState } from '../hooks/useSortState';
import { formatBytes, formatDate, formatDateTime } from '../utils/formatters';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { HeaderIcon } from '../components/table/HeaderIcon';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { EllipsisCell } from '../components/table/TrackTitleCell';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { LoadFailed } from '../components/ui/EmptyState';
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
    failed,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList({
    pageSize: PAGE_SIZE,
    params: queryParams,
    fetchPage: mp3Api.listAlbumsPaged,
    getKey: getAlbumKey,
  });

  const player = usePlayer();
  const currentAlbumKey = player.currentTrack?.album_key;

  const renderSortHeader = (column: AlbumSortBy, label: string, icon: LucideIcon) => {
    return (
      <SortableHeaderButton
        label={label}
        icon={icon}
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
            icon={DiscAlbum}
            isCurrent={currentAlbumKey === album.album_key}
            isPlaying={player.state.isPlaying}
            onPlay={() => void player.playAlbum(album.album_key)}
            onToggle={player.togglePlay}
          />
        </div>
      ),
    },
    {
      key: 'album',
      header: renderSortHeader('album_name', 'Album', DiscAlbum),
      render: (album) => (
        <>
          <EllipsisCell text={album.album_name || '(No Album)'} />
          {album.artists.length > 0 && (
            <span className="table-cell-subtitle" title={formatArtists(album)}>{formatArtists(album)}</span>
          )}
        </>
      ),
    },
    {
      key: 'artists',
      header: <HeaderIcon label="Artists" icon={MicVocal} />,
      hideBelow: 'sm',
      render: (album) => <EllipsisCell text={formatArtists(album)} />,
    },
    {
      key: 'tracks',
      header: renderSortHeader('track_count', 'Tracks', Music),
      width: '90px',
      hideBelow: 'sm',
      render: (album) => <EllipsisCell text={String(album.track_count)} />,
    },
    {
      key: 'size',
      header: renderSortHeader('total_size', 'Size', HardDrive),
      width: '110px',
      hideBelow: 'md',
      render: (album) => <EllipsisCell text={formatBytes(album.total_size)} />,
    },
    {
      key: 'date_added',
      header: renderSortHeader('date_added', 'Date added', CalendarPlus),
      width: '128px',
      hideBelow: 'sm',
      render: (album) => <span className="library-date" title={formatDateTime(album.date_added)}>{formatDate(album.date_added)}</span>,
    },
  ];

  return (
    <div className="page page--fill">
      {failed ? (
        <LoadFailed label="Couldn't load albums" onRetry={() => void refresh()} />
      ) : (
        <DataTable
          fill
          columns={columns}
          items={albums}
          getRowKey={getAlbumKey}
          onRowOpen={(album) => navigate(`/albums/${encodeURIComponent(album.album_key)}`)}
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
      )}
    </div>
  );
}
