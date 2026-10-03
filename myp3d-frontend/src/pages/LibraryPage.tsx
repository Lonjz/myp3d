import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ListFilter, Pencil, Play, RefreshCw, Search, Shuffle, Trash2 } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3FilterBy, MP3SortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePagedList } from '../hooks/usePagedList';
import { useSortState } from '../hooks/useSortState';
import { formatBytes, formatDate, formatDateTime } from '../utils/formatters';
import { emitAppEvent } from '../utils/appEvents';
import { PaginatedTable } from '../components/table/PaginatedTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';

const PAGE_SIZE = 25;
const SORT_COLUMN_LABELS: Record<MP3SortBy, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  filename: 'File Name',
  size: 'Size',
  date_added: 'Date Added',
};
const LIBRARY_COLUMN_WIDTHS = {
  cover: '76px',
  title: '18%',
  artist: '14%',
  album: '14%',
  filename: '21%',
  size: '96px',
  dateAdded: '128px',
  actions: '148px',
} as const;

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
    error,
    loadPage: loadMp3s,
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
    fetchPage: mp3Api.listAllPaged,
    errorMessage: 'Failed to load MP3 library',
    cacheKeyPrefix: 'library',
    resetKey: `${searchQuery}|${filterBy}|${sortBy}|${sortDirection}`,
    storageKey: 'library:page',
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

  if (loading && mp3s.length === 0) return <div className="page"><Spinner /></div>;
  if (error && mp3s.length === 0) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <div className="library-toolbar">
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
        <IconButton icon={RefreshCw} label="Refresh" onClick={() => void loadMp3s({ force: true })} />
      </div>

      {error && <p className="error">{error}</p>}

      {totalItems === 0 ? (
        <p className="page-empty">No tracks yet</p>
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
          emptyMessage="No matches"
          headerRow={(
            <tr>
              <th><span className="sr-only">Cover</span></th>
              <th>{renderSortHeader('title')}</th>
              <th>{renderSortHeader('artist')}</th>
              <th>{renderSortHeader('album')}</th>
              <th>{renderSortHeader('filename')}</th>
              <th>{renderSortHeader('size')}</th>
              <th>{renderSortHeader('date_added')}</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          )}
          rowContent={mp3s.map((mp3) => (
            <tr key={mp3.filename}>
              <td>
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
              </td>
              <td><span className="table-cell-ellipsis" title={mp3.title || '-'}>{mp3.title || '-'}</span></td>
              <td><span className="table-cell-ellipsis" title={mp3.artist || '-'}>{mp3.artist || '-'}</span></td>
              <td><span className="table-cell-ellipsis" title={mp3.album || '-'}>{mp3.album || '-'}</span></td>
              <td><span className="library-filename" title={mp3.filename}>{mp3.filename}</span></td>
              <td><span className="table-cell-ellipsis" title={formatBytes(mp3.file_size)}>{formatBytes(mp3.file_size)}</span></td>
              <td><span className="library-date" title={formatDateTime(mp3.date_added)}>{formatDate(mp3.date_added)}</span></td>
              <td>
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
