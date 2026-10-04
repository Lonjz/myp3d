import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  ListChecks,
  ListFilter,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Shuffle,
  Square,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { MP3FilterBy, MP3Info, MP3SortBy } from '../api/mp3Api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { usePersistentState } from '../hooks/usePersistentState';
import { usePresence } from '../hooks/usePresence';
import { useSequentialDownload } from '../hooks/useSequentialDownload';
import { useSortState } from '../hooks/useSortState';
import { useTrackSelection } from '../hooks/useTrackSelection';
import { formatBytes, formatDate, formatDateTime } from '../utils/formatters';
import { emitAppEvent } from '../utils/appEvents';
import { DataTable } from '../components/table/DataTable';
import type { DataTableColumn } from '../components/table/DataTable';
import { SortableHeaderButton } from '../components/table/SortableHeaderButton';
import { BulkEditDialog } from '../components/library/BulkEditDialog';
import { useLibrarySelectionCommands } from '../components/library/useLibrarySelectionCommands';
import { useToast } from '../components/messages/ToastProvider';
import { CoverPlayButton } from '../components/player/CoverPlayButton';
import { usePlayer } from '../components/player/playerContext';
import { Checkbox } from '../components/ui/Checkbox';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
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
const trackCount = (count: number) => `${count} track${count === 1 ? '' : 's'}`;
const isShiftClick = (event: ChangeEvent<HTMLInputElement>) =>
  event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;

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
  const { showSuccess, showError } = useToast();
  const selection = useTrackSelection();
  const downloads = useSequentialDownload();
  const [selectingAll, setSelectingAll] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const editPresence = usePresence(editOpen);
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { clear: clearSelection } = selection;

  useEffect(() => () => {
    clearSelection();
    setEditOpen(false);
    setDeleteTargets(null);
  }, [clearSelection]);

  const loadMatchingTracks = () =>
    mp3Api.listAll({ search: debouncedSearchQuery, filterBy, sortBy, sortDirection });

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

  const confirmDelete = async () => {
    if (!deleteTargets) return;
    const targets = deleteTargets;
    setDeleteTargets(null);
    setDeleting(true);
    try {
      const result = await mp3Api.bulkDelete(targets);
      selection.deselect(result.updated);
      emitAppEvent('library-changed');
      if (result.failed.length === 0) {
        showSuccess(`Deleted ${trackCount(result.updated.length)}`);
      } else if (targets.length === 1) {
        showError(`Couldn't delete: ${result.failed[0].detail}`);
      } else {
        showError(`${result.failed.length} of ${trackCount(targets.length)} couldn't be deleted`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const hasSelection = selection.size > 0;
  const playSelected = () => {
    if (hasSelection) player.playTracks(selection.tracks, 0);
  };
  const editSelected = () => {
    if (hasSelection) setEditOpen(true);
  };
  const downloadSelected = () => {
    if (hasSelection) void downloads.start(selection.filenames);
  };
  const deleteSelected = () => {
    if (hasSelection) setDeleteTargets(selection.filenames);
  };

  useLibrarySelectionCommands(selection.size, {
    selectAll: () => void selectAll(),
    clear: selection.clear,
    play: playSelected,
    edit: editSelected,
    download: downloadSelected,
    remove: deleteSelected,
  });

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
            onClick={() => setDeleteTargets([mp3.filename])}
          />
        </div>
      ),
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
        getRowClassName={(mp3) => (selection.isSelected(mp3.filename) ? 'is-selected' : undefined)}
        className="library-table--selectable"
        emptyMessage={debouncedSearchQuery.trim() ? 'No matches' : 'No tracks yet'}
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

      <ConfirmDialog
        open={deleteTargets !== null}
        icon={TriangleAlert}
        title={deleteTargets?.length === 1 ? `Delete "${deleteTargets[0]}"?` : `Delete ${trackCount(deleteTargets?.length ?? 0)}?`}
        cancelLabel="Keep"
        cancelIcon={Undo2}
        confirmLabel="Delete"
        confirmIcon={Trash2}
        tone="danger"
        onCancel={() => setDeleteTargets(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
