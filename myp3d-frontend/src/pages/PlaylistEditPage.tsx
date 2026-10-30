import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlignLeft, Clock, DiscAlbum, GripVertical, ImagePlus, ListMinus, ListMusic, Music, Play, Save, Shuffle, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import type { MP3Info } from '../api/mp3Api';
import { NEW_PLAYLIST_NAME, playlistApi } from '../api/playlistApi';
import type { PlaylistDetail, PlaylistInfo } from '../api/playlistApi';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/toastContext';
import { useTrackActions } from '../components/library/trackActionsContext';
import { usePlayer } from '../components/player/playerContext';
import { TrackIndexButton } from '../components/player/TrackIndexButton';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { DataTable } from '../components/table/DataTable';
import { HeaderIcon } from '../components/table/HeaderIcon';
import { TrackTitleCell } from '../components/table/TrackTitleCell';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState, LoadFailed } from '../components/ui/EmptyState';
import { useDetail } from '../hooks/useDetail';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { emitAppEvent } from '../utils/appEvents';
import { errorMessage, formatDuration, trackCount } from '../utils/formatters';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useSaveShortcut } from '../hooks/useSaveShortcut';

interface PlaylistEditPageProps {
  playlistId: string;
  onBack: () => void;
}

const PLAYLIST_SIDEBAR_PAGE_SIZE = 25;

const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

interface TrackRow {
  key: string;
  track: MP3Info;
}

const toRows = (tracks: MP3Info[]): TrackRow[] => tracks.map((track, index) => ({ key: `${index}:${track.filename}`, track }));

const sameOrder = (left: MP3Info[], right: MP3Info[]) =>
  left.length === right.length && left.every((track, index) => track.filename === right[index].filename);

export function PlaylistEditPage({ playlistId, onBack }: PlaylistEditPageProps) {
  const navigate = useNavigate();
  const player = usePlayer();
  const { favorites, openMenu, menuFilename } = useTrackActions();
  const { showSuccess, showError, showInfo, clearToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    cropModalProps,
    coverFile,
    coverPreview,
    handleCoverChange,
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
    outputFilename: 'playlist-cover.jpg',
  });

  const applyFields = (next: PlaylistDetail) => {
    resetCoverState();
    setName(next.name);
    setDescription(next.description);
    setRows(toRows(next.tracks));
  };

  const { detail, current, missing, failed, reload, update } = useDetail(playlistId, (id) => playlistApi.get(id), applyFields, (err) =>
    showError(errorMessage(err, 'Failed to load playlist')),
  );

  const tracks = rows.map((row) => row.track);
  const isNameDirty = detail !== null && name.trim() !== detail.name;
  const isDescriptionDirty = detail !== null && description.trim() !== detail.description;
  const isOrderDirty = detail !== null && !sameOrder(tracks, detail.tracks);
  const isDirty = isNameDirty || isDescriptionDirty || isOrderDirty || coverFile !== null;

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isDirty);
  useSaveShortcut(() => void handleSave(), !(saving || !current || !isDirty || !name.trim()));

  const handleSave = async () => {
    if (!detail || !current) return;

    setSaving(true);
    showInfo('Saving playlist...');
    try {
      if (isNameDirty || isDescriptionDirty || isOrderDirty) {
        await playlistApi.update(playlistId, {
          name: isNameDirty ? name : undefined,
          description: isDescriptionDirty ? description : undefined,
          filenames: isOrderDirty ? tracks.map((track) => track.filename) : undefined,
        });
      }
      if (coverFile) {
        await playlistApi.updateCover(playlistId, coverFile);
      }
      await reload();
      emitAppEvent('playlists-changed');
      showSuccess('Playlist saved');
    } catch (err) {
      showError(errorMessage(err, 'Failed to save playlist'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setSaving(true);
    try {
      await playlistApi.remove(playlistId);
      emitAppEvent('playlists-changed');
      allowNavigation();
      navigate('/playlists', { replace: true });
    } catch (err) {
      showError(errorMessage(err, 'Failed to delete playlist'));
      setSaving(false);
    }
  };

  const moveTrack = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((current) => moveItem(current, from, to));
  };

  const removeRow = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  const dropDeleted = (filenames: string[]) => {
    const deleted = new Set(filenames);
    const kept = (track: MP3Info) => !deleted.has(track.filename);
    setRows((current) => current.filter((row) => kept(row.track)));
    update((loaded) => ({ ...loaded, tracks: loaded.tracks.filter(kept) }));
  };

  const handleGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (offset === 0) return;
    event.preventDefault();
    moveTrack(index, index + offset);
    const row = event.currentTarget.closest('tr');
    const sibling = offset < 0 ? row?.previousElementSibling : row?.nextElementSibling;
    window.requestAnimationFrame(() => sibling?.querySelector<HTMLButtonElement>('.playlist-grip')?.focus());
  };

  if (missing) return <div className="page"><EmptyState icon={ListMusic} label="Playlist not found" /></div>;
  if (failed) return <div className="page"><LoadFailed label="Couldn't load the playlist" onRetry={() => void reload()} /></div>;
  if (!detail) return <div className="page"><Spinner /></div>;

  const effectiveCoverPreview = coverPreview || (detail.has_cover ? playlistApi.coverUrl(detail, 'full') : null);

  return (
    <div className="page">
      <div className="details-layout">
        <InfiniteSidebarList<PlaylistInfo>
          backLabel="Back to playlists"
          onBack={onBack}
          activeKey={playlistId}
          getItemKey={(playlist) => playlist.id}
          getItemTitle={(playlist) => playlist.name}
          getItemSubtitle={(playlist) => trackCount(playlist.track_count)}
          onSelect={(playlist) => navigate(`/playlists/${encodeURIComponent(playlist.id)}`)}
          fetchPage={async ({ page, limit, search }) => {
            const query = search.trim().toLowerCase();
            const all = await playlistApi.list();
            const matches = query ? all.filter((playlist) => playlist.name.toLowerCase().includes(query)) : all;
            return {
              items: matches.slice((page - 1) * limit, page * limit),
              total: matches.length,
              totalPages: Math.max(1, Math.ceil(matches.length / limit)),
            };
          }}
          emptyMessage="No matches"
          pinnedItem={detail}
          pageSize={PLAYLIST_SIDEBAR_PAGE_SIZE}
          searchDebounceMs={300}
        />

        <section className="details-main">
          <h1 className="details-title">{detail.name}</h1>

          <div className="edit-container glass">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleCoverChange}
              className="hidden-file-input"
            />
            <button
              type="button"
              className="cover-preview"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || !current}
              aria-label="Change playlist cover"
              title="Change playlist cover"
            >
              {effectiveCoverPreview ? (
                <img src={effectiveCoverPreview} alt="" />
              ) : (
                <div className="no-cover-large playlist-no-cover">
                  <ListMusic aria-hidden="true" />
                </div>
              )}
              <span className="cover-preview__overlay" aria-hidden="true">
                <ImagePlus />
              </span>
            </button>

            <div className="metadata-section">
              <IconField
                icon={ListMusic}
                label="Playlist name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => {
                  const input = e.currentTarget;
                  if (input.value === NEW_PLAYLIST_NAME) window.requestAnimationFrame(() => input.select());
                }}
                autoFocus={detail.name === NEW_PLAYLIST_NAME}
                disabled={saving || !current}
              />
              <label className="icon-field icon-field--area" title="Description">
                <AlignLeft className="icon-field__icon" aria-hidden="true" />
                <textarea
                  aria-label="Description"
                  placeholder="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={saving || !current}
                />
              </label>

              <div className="album-chips">
                <span className="album-chip" title="Tracks">
                  <Music aria-hidden="true" />
                  {tracks.length}
                </span>
              </div>

              <div className="metadata-actions">
                <IconButton
                  icon={Trash2}
                  label="Delete playlist"
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving || !current}
                />
                <IconButton
                  icon={Play}
                  label="Play playlist"
                  onClick={() => player.playTracks(tracks, 0)}
                  disabled={tracks.length === 0}
                />
                <IconButton
                  icon={Shuffle}
                  label="Shuffle playlist"
                  onClick={() => player.playTracks(tracks, undefined, { shuffle: true })}
                  disabled={tracks.length === 0}
                />
                <IconButton
                  icon={Save}
                  label="Save"
                  variant="primary"
                  onClick={() => void handleSave()}
                  busy={saving}
                  disabled={saving || !current || !isDirty || !name.trim()}
                />
              </div>
            </div>
          </div>

          <DataTable
            className="album-tracks-table playlist-tracks-table"
            items={rows}
            getRowKey={(row) => row.key}
            getRowClassName={({ key, track }) =>
              [
                player.isCurrent(track.filename) ? 'is-current' : '',
                dragIndex !== null && rows[dragIndex]?.key === key ? 'is-dragging' : '',
                menuFilename === track.filename ? 'is-menu-open' : '',
              ].filter(Boolean).join(' ') || undefined
            }
            onRowMenu={saving ? undefined : ({ key, track }, event) =>
              openMenu(event, track, {
                play: () => player.playTracks(tracks, rows.findIndex((row) => row.key === key)),
                extra: [{ id: 'remove-from-playlist', label: 'Remove from playlist', icon: ListMinus, run: () => removeRow(key) }],
                onDeleted: dropDeleted,
              })
            }
            getRowProps={({ track }, index) => ({
              draggable: !saving,
              onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', track.filename);
                setDragIndex(index);
              },
              onDragOver: (event) => {
                if (dragIndex === null) return;
                event.preventDefault();
                if (dragIndex !== index) {
                  moveTrack(dragIndex, index);
                  setDragIndex(index);
                }
              },
              onDrop: (event) => event.preventDefault(),
              onDragEnd: () => setDragIndex(null),
            })}
            emptyMessage="No tracks"
            columns={[
              {
                key: 'grip',
                header: <span className="sr-only">Reorder</span>,
                width: '3rem',
                render: ({ track }, index) => (
                  <button
                    type="button"
                    className="playlist-grip"
                    aria-label={`Move ${track.title || track.filename}`}
                    title="Drag or use arrow keys to move"
                    onKeyDown={(event) => handleGripKeyDown(event, index)}
                    disabled={saving || !current}
                  >
                    <GripVertical aria-hidden="true" />
                  </button>
                ),
              },
              {
                key: 'index',
                header: <span className="sr-only">Play</span>,
                width: '4rem',
                render: ({ track }, index) => (
                  <TrackIndexButton
                    index={index + 1}
                    label={`Play ${track.title || track.filename}`}
                    isCurrent={player.isCurrent(track.filename)}
                    isPlaying={player.state.isPlaying}
                    onPlay={() => player.playTracks(tracks, index)}
                    onToggle={player.togglePlay}
                  />
                ),
              },
              {
                key: 'title',
                header: <HeaderIcon label="Title" icon={Music} />,
                render: ({ track }) => (
                  <TrackTitleCell
                    title={track.title || track.filename}
                    subtitle={track.artist ?? undefined}
                    favorite={favorites.has(track.filename)}
                  />
                ),
              },
              {
                key: 'album',
                header: <HeaderIcon label="Album" icon={DiscAlbum} />,
                hideBelow: 'sm',
                render: ({ track }) => <span className="table-cell-ellipsis" title={track.album || '-'}>{track.album || '-'}</span>,
              },
              {
                key: 'duration',
                header: <HeaderIcon label="Duration" icon={Clock} />,
                width: '80px',
                hideBelow: 'md',
                render: ({ track }) => formatDuration(track.duration),
              },
            ]}
          />
        </section>
      </div>

      <DiscardChangesDialog blocker={blocker} />

      <ConfirmDialog
        open={confirmDelete}
        icon={TriangleAlert}
        title={`Delete "${detail.name}"?`}
        cancelLabel="Keep"
        cancelIcon={Undo2}
        confirmLabel="Delete"
        confirmIcon={Trash2}
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />

      <CoverCropModal {...cropModalProps} />
    </div>
  );
}
