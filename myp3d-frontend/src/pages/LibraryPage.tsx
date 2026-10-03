import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ListFilter, Pencil, Play, RefreshCw, Search, Shuffle, Trash2 } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3FilterBy, MP3Info, MP3SortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { usePersistentState } from '../hooks/usePersistentState';
import { useSortState } from '../hooks/useSortState';
import { formatBytes, formatDate, formatDateTime } from '../utils/formatters';
import { emitAppEvent } from '../utils/appEvents';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';

const PAGE_SIZE = 50;
const SORT_COLUMN_LABELS: Record<MP3SortBy, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  filename: 'File Name',
  size: 'Size',
  date_added: 'Date Added',
};

const getTrackKey = (mp3: MP3Info) => mp3.filename;

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = usePersistentState('library:search', '');
  const [filterBy, setFilterBy] = usePersistentState<MP3FilterBy>('library:filter', 'all');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { sortBy, sortDirection, handleSortClick } = useSortState<MP3SortBy>({
    initialSortBy: 'date_added',
    initialDirection: 'desc',
    getDefaultDirection: (column) => (column === 'date_added' ? 'desc' : 'asc'),
    storageKey: 'library:sort',
  });

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
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList({
    pageSize: PAGE_SIZE,
    params: queryParams,
    fetchPage: mp3Api.listAllPaged,
    getKey: getTrackKey,
    errorMessage: 'Failed to load MP3 library',
  });

  const player = usePlayer();

  const loadPlayableTracks = async () => {
    try {
      return await mp3Api.listAll({ search: debouncedSearchQuery, filterBy, sortBy, sortDirection });
    } catch {
      return mp3s;
    }
  };

  const playFrom = async (filename: string) => {
    const tracks = await loadPlayableTracks();
    const index = tracks.findIndex((track) => track.filename === filename);
    player.playTracks(tracks, Math.max(0, index));
  };

  const playAll = async (shuffle: boolean) => {
    const tracks = await loadPlayableTracks();
    player.playTracks(tracks, shuffle ? undefined : 0, { shuffle });
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await mp3Api.delete(filename);
      emitAppEvent('library-changed');
    } catch {
      alert('Failed to delete file');
    }
  };

  const renderSortHeader = (column: MP3SortBy) => {
    return (
      <SortableHeaderButton
        label={SORT_COLUMN_LABELS[column]}
        isActive={sortBy === column}
        sortDirection={sortDirection}
        onClick={() => handleSortClick(column)}
      />
    );
  };

  const columns: DataTableColumn<MP3Info>[] = [
    {
      key: 'cover',
      header: <span className="sr-only">Cover</span>,
      width: '76px',
      render: (mp3) => (
        <div className="library-cover-sm">
          <CoverPlayButton
            src={mp3.has_cover ? mp3Api.getCoverUrl(mp3.filename, 'thumb') : undefined}
            label={`Play ${mp3.title || mp3.filename}`}
            isCurrent={player.isCurrent(mp3.filename)}
            isPlaying={player.state.isPlaying}
            onPlay={() => void playFrom(mp3.filename)}
            onToggle={player.togglePlay}
          />
        </div>
      ),
    },
    {
      key: 'title',
      header: renderSortHeader('title'),
      render: (mp3) => {
        const subtitle = [mp3.artist, mp3.album].filter(Boolean).join(' · ');
        return (
          <>
            <span className="table-cell-ellipsis" title={mp3.title || '-'}>{mp3.title || '-'}</span>
            {subtitle && <span className="table-cell-subtitle" title={subtitle}>{subtitle}</span>}
          </>
        );
      },
    },
    {
      key: 'artist',
      header: renderSortHeader('artist'),
      hideBelow: 'sm',
      render: (mp3) => <span className="table-cell-ellipsis" title={mp3.artist || '-'}>{mp3.artist || '-'}</span>,
    },
    {
      key: 'album',
      header: renderSortHeader('album'),
      hideBelow: 'sm',
      render: (mp3) => <span className="table-cell-ellipsis" title={mp3.album || '-'}>{mp3.album || '-'}</span>,
    },
    {
      key: 'filename',
      header: renderSortHeader('filename'),
      hideBelow: 'md',
      render: (mp3) => <span className="library-filename" title={mp3.filename}>{mp3.filename}</span>,
    },
    {
      key: 'size',
      header: renderSortHeader('size'),
      width: '96px',
      hideBelow: 'md',
      render: (mp3) => <span className="table-cell-ellipsis" title={formatBytes(mp3.file_size)}>{formatBytes(mp3.file_size)}</span>,
    },
    {
      key: 'date_added',
      header: renderSortHeader('date_added'),
      width: '128px',
      hideBelow: 'sm',
      render: (mp3) => <span className="library-date" title={formatDateTime(mp3.date_added)}>{formatDate(mp3.date_added)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '148px',
      render: (mp3) => (
        <div className="table-actions">
          <IconButton
            icon={Pencil}
            label="Edit"
            size="sm"
            onClick={() => navigate(`/details/${encodeURIComponent(mp3.filename)}`)}
          />
          <a
            href={mp3Api.getFileUrl(mp3.filename)}
            download
            className="icon-btn icon-btn--default icon-btn--sm"
            aria-label="Download"
            title="Download"
          >
            <Download aria-hidden="true" />
          </a>
          <IconButton
            icon={Trash2}
            label="Delete"
            size="sm"
            variant="danger"
            onClick={() => handleDelete(mp3.filename)}
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
        items={mp3s}
        getRowKey={getTrackKey}
        emptyMessage={debouncedSearchQuery.trim() ? 'No matches' : 'No tracks yet'}
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
            <label className="icon-field library-filter" title="Filter by">
              <ListFilter className="icon-field__icon" aria-hidden="true" />
              <select
                aria-label="Filter by"
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as MP3FilterBy)}
              >
                <option value="all">All</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="album">Album</option>
                <option value="filename">File name</option>
              </select>
            </label>
            <IconButton icon={Play} label="Play all" onClick={() => void playAll(false)} disabled={totalItems === 0} />
            <IconButton icon={Shuffle} label="Shuffle all" onClick={() => void playAll(true)} disabled={totalItems === 0} />
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => void refresh()} />
            <span className="library-count">{mp3s.length} / {totalItems}</span>
          </>
        )}
      />
    </div>
  );
}
