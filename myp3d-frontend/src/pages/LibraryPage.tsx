import { Fragment, useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus,
  Clock,
  CopyX,
  DiscAlbum,
  Download,
  FileAudio,
  HardDrive,
  HeartPulse,
  Image,
  ListChecks,
  ListFilter,
  ListMusic,
  ListPlus,
  MicVocal,
  Music,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Shuffle,
  Square,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3DurationRange, MP3FilterBy, MP3Info, MP3Issue, MP3SortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePresence } from '../hooks/usePresence';
import { useSequentialDownload } from '../hooks/useSequentialDownload';
import { useSortState } from '../hooks/useSortState';
import { useTrackSelection } from '../hooks/useTrackSelection';
import { formatBytes, formatDate, formatDateTime, formatDuration } from '../utils/formatters';
import { subscribeAppEvent } from '../utils/appEvents';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { TrackTitleCell } from '../components/table/TrackTitleCell';
import { BulkEditDialog } from '../components/library/BulkEditDialog';
import { useLibrarySelectionCommands } from '../components/library/useLibrarySelectionCommands';
import { useTrackActions } from '../components/library/trackActionsContext';
import { AddToPlaylistDialog } from '../components/playlists/AddToPlaylistDialog';
import { useToast } from '../components/messages/toastContext';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { Checkbox } from '../components/ui/Checkbox';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { IconSelect } from '../components/ui/IconSelect';
import type { IconSelectOption } from '../components/ui/IconSelect';

const PAGE_SIZE = 50;
const SORT_COLUMNS: Record<MP3SortBy, { label: string; icon: LucideIcon }> = {
  title: { label: 'Title', icon: Music },
  artist: { label: 'Artist', icon: MicVocal },
  album: { label: 'Album', icon: DiscAlbum },
  filename: { label: 'File name', icon: FileAudio },
  size: { label: 'Size', icon: HardDrive },
  duration: { label: 'Duration', icon: Clock },
  date_added: { label: 'Date added', icon: CalendarPlus },
};

const DURATION_OPTIONS: Array<[MP3DurationRange, string]> = [
  ['any', 'Any'],
  ['under-2', '< 2'],
  ['2-3', '2–3'],
  ['3-4', '3–4'],
  ['4-5', '4–5'],
  ['5-7', '5–7'],
  ['over-7', '7+'],
];

const SCOPE_OPTIONS: IconSelectOption<MP3FilterBy>[] = [
  { value: 'all', label: 'All', icon: ListFilter },
  { value: 'title', label: 'Title', icon: Music },
  { value: 'artist', label: 'Artist', icon: MicVocal },
  { value: 'album', label: 'Album', icon: DiscAlbum },
  { value: 'filename', label: 'File name', icon: FileAudio },
];

const ISSUE_OPTIONS: IconSelectOption<MP3Issue>[] = [
  { value: 'any', label: 'Any', icon: HeartPulse },
  { value: 'title', label: 'Missing title', icon: Type },
  { value: 'artist', label: 'Missing artist', icon: MicVocal },
  { value: 'album', label: 'Missing album', icon: DiscAlbum },
  { value: 'cover', label: 'Missing cover art', icon: Image },
  { value: 'duplicate', label: 'Duplicates', icon: CopyX },
  { value: 'playlist', label: 'Not in a playlist', icon: ListMusic },
];

const LINK_PARAMS = ['q', 'filter', 'duration', 'favorites', 'issue'];

function pickOption<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

const getTrackKey = (mp3: MP3Info) => mp3.filename;
const isShiftClick = (event: ChangeEvent<HTMLInputElement>) =>
  event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = usePersistentState('library:search', '');
  const [filterBy, setFilterBy] = usePersistentState<MP3FilterBy>('library:filter', 'all');
  const [durationRange, setDurationRange] = usePersistentState<MP3DurationRange>('library:duration', 'any');
  const [favoritesOnly, setFavoritesOnly] = usePersistentState('library:favorites', false);
  const [issue, setIssue] = usePersistentState<MP3Issue>('library:issue', 'any');
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
      durationRange,
      favoritesOnly,
      issue,
    }),
    [debouncedSearchQuery, filterBy, sortBy, sortDirection, durationRange, favoritesOnly, issue],
  );

  const [searchParams, setSearchParams] = useSearchParams();

  const applySearchParams = useEffectEvent((params: URLSearchParams) => {
    if (!LINK_PARAMS.some((key) => params.has(key))) return;
    setSearchQuery(params.get('q') ?? '');
    setFilterBy(pickOption(params.get('filter'), SCOPE_OPTIONS.map((option) => option.value), 'all'));
    setDurationRange(pickOption(params.get('duration'), DURATION_OPTIONS.map(([value]) => value), 'any'));
    setFavoritesOnly(params.get('favorites') === '1');
    setIssue(pickOption(params.get('issue'), ISSUE_OPTIONS.map((option) => option.value), 'any'));
    setSearchParams({}, { replace: true });
  });

  useEffect(() => {
    applySearchParams(searchParams);
  }, [searchParams]);

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
  const { favorites, deleting, requestDelete, openMenu, menuFilename } = useTrackActions();
  const { showError } = useToast();
  const selection = useTrackSelection();
  const downloads = useSequentialDownload();
  const [selectingAll, setSelectingAll] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const editPresence = usePresence(editOpen);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const playlistPresence = usePresence(playlistOpen);
  const { clear: clearSelection } = selection;

  useEffect(() => () => {
    clearSelection();
    setEditOpen(false);
  }, [clearSelection]);

  useEffect(() => {
    if (!favoritesOnly) return undefined;
    return subscribeAppEvent('playlists-changed', () => void refresh());
  }, [favoritesOnly, refresh]);

  const loadMatchingTracks = () => mp3Api.listAll(queryParams);

  const loadPlayableTracks = async () => {
    try {
      return await loadMatchingTracks();
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

  const selectAll = async () => {
    setSelectingAll(true);
    try {
      selection.selectMany(await loadMatchingTracks());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to select tracks');
    } finally {
      setSelectingAll(false);
    }
  };

  const allSelected = totalItems > 0 && selection.size >= totalItems;
  const toggleSelectAll = () => {
    if (allSelected) {
      selection.clear();
    } else {
      void selectAll();
    }
  };

  const hasSelection = selection.size > 0;
  const playSelected = () => {
    if (hasSelection) player.playTracks(selection.tracks, 0);
  };
  const editSelected = () => {
    if (hasSelection) setEditOpen(true);
  };
  const addSelectedToPlaylist = () => {
    if (hasSelection) setPlaylistOpen(true);
  };
  const downloadSelected = () => {
    if (hasSelection) void downloads.start(selection.filenames);
  };
  const deleteSelected = () => {
    if (hasSelection) requestDelete(selection.filenames, selection.deselect);
  };

  useLibrarySelectionCommands(selection.size, {
    selectAll: () => void selectAll(),
    clear: selection.clear,
    play: playSelected,
    edit: editSelected,
    addToPlaylist: addSelectedToPlaylist,
    download: downloadSelected,
    remove: deleteSelected,
  });

  const renderSortHeader = (column: MP3SortBy) => {
    return (
      <SortableHeaderButton
        label={SORT_COLUMNS[column].label}
        icon={SORT_COLUMNS[column].icon}
        isActive={sortBy === column}
        sortDirection={sortDirection}
        onClick={() => handleSortClick(column)}
      />
    );
  };

  const columns: DataTableColumn<MP3Info>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          label={allSelected ? 'Clear selection' : 'Select all'}
          checked={allSelected}
          indeterminate={hasSelection && !allSelected}
          disabled={totalItems === 0 || selectingAll}
          onChange={toggleSelectAll}
        />
      ),
      width: '3.25rem',
      noRowOpen: true,
      render: (mp3, index) => (
        <Checkbox
          label={`Select ${mp3.title || mp3.filename}`}
          checked={selection.isSelected(mp3.filename)}
          onChange={(event) => selection.toggle(mp3, index, isShiftClick(event), mp3s)}
        />
      ),
    },
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
      render: (mp3) => (
        <TrackTitleCell
          title={mp3.title || '-'}
          subtitle={[mp3.artist, mp3.album].filter(Boolean).join(' · ')}
          favorite={favorites.has(mp3.filename)}
        />
      ),
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
      key: 'duration',
      header: renderSortHeader('duration'),
      width: '96px',
      hideBelow: 'md',
      render: (mp3) => {
        const length = formatDuration(mp3.duration == null ? null : Math.round(mp3.duration));
        return <span className="table-cell-ellipsis" title={length}>{length}</span>;
      },
    },
    {
      key: 'date_added',
      header: renderSortHeader('date_added'),
      width: '128px',
      hideBelow: 'sm',
      render: (mp3) => <span className="library-date" title={formatDateTime(mp3.date_added)}>{formatDate(mp3.date_added)}</span>,
    },
  ];

  const downloadControl = downloads.progress ? (
    <button
      type="button"
      className="library-progress-pill"
      onClick={downloads.cancel}
      aria-label="Stop downloading"
      title="Stop downloading"
    >
      <Square aria-hidden="true" />
      {downloads.progress.done} / {downloads.progress.total}
    </button>
  ) : (
    <IconButton icon={Download} label="Download selected" onClick={downloadSelected} />
  );

  return (
    <div className="page page--fill">
      {error && <p className="error">{error}</p>}

      <DataTable
        fill
        columns={columns}
        items={mp3s}
        getRowKey={getTrackKey}
        onRowOpen={(mp3) => navigate(`/details/${encodeURIComponent(mp3.filename)}`)}
        onRowMenu={(mp3, event) =>
          openMenu(event, mp3, { play: () => void playFrom(mp3.filename), onDeleted: selection.deselect })
        }
        getRowClassName={(mp3) =>
          [selection.isSelected(mp3.filename) ? 'is-selected' : '', menuFilename === mp3.filename ? 'is-menu-open' : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        className="library-table--selectable"
        emptyMessage={
          debouncedSearchQuery.trim() || favoritesOnly || issue !== 'any' || durationRange !== 'any'
            ? 'No matches'
            : 'No tracks yet'
        }
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onEndReached={loadMore}
        resetKey={queryParams}
        toolbar={hasSelection ? (
          <Fragment key="selection">
            <IconButton icon={X} label="Clear selection" onClick={selection.clear} />
            <span className="library-selection-count" title="Selected">
              <ListChecks aria-hidden="true" />
              {selection.size}
            </span>
            <IconButton icon={Play} label="Play selected" onClick={playSelected} />
            <IconButton icon={Pencil} label="Edit selected" onClick={editSelected} disabled={deleting} />
            <IconButton icon={ListPlus} label="Add to playlist" onClick={addSelectedToPlaylist} disabled={deleting} />
            {downloadControl}
            <IconButton icon={Trash2} label="Delete selected" variant="danger" onClick={deleteSelected} disabled={deleting} />
          </Fragment>
        ) : (
          <Fragment key="browse">
            <IconField
              icon={Search}
              label="Search"
              className="library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <IconSelect label="Search in" value={filterBy} options={SCOPE_OPTIONS} onChange={setFilterBy} />
            <label className="icon-field library-duration" title="Duration in minutes">
              <Clock className="icon-field__icon" aria-hidden="true" />
              <select
                aria-label="Duration in minutes"
                value={durationRange}
                onChange={(e) => setDurationRange(e.target.value as MP3DurationRange)}
              >
                {DURATION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <IconSelect
              label="Issues"
              value={issue}
              options={ISSUE_OPTIONS}
              onChange={setIssue}
              active={issue !== 'any'}
            />
            <IconButton
              icon={Star}
              label="Favourites only"
              active={favoritesOnly}
              className={`favorite-filter favorite-toggle ${favoritesOnly ? 'is-favorite' : ''}`.trim()}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
            />
            <IconButton icon={Play} label="Play all" onClick={() => void playAll(false)} disabled={totalItems === 0} />
            <IconButton icon={Shuffle} label="Shuffle all" onClick={() => void playAll(true)} disabled={totalItems === 0} />
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => void refresh()} />
            {downloads.progress && downloadControl}
            <span className="library-count">{mp3s.length} / {totalItems}</span>
          </Fragment>
        )}
      />

      {editPresence.mounted && (
        <BulkEditDialog
          tracks={selection.tracks}
          closing={editPresence.closing}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            selection.clear();
          }}
        />
      )}

      {playlistPresence.mounted && (
        <AddToPlaylistDialog
          filenames={selection.filenames}
          closing={playlistPresence.closing}
          onClose={() => setPlaylistOpen(false)}
          onAdded={() => {
            setPlaylistOpen(false);
            selection.clear();
          }}
        />
      )}
    </div>
  );
}
