import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscAlbum, FileAudio, HardDrive, ImagePlus, MicVocal, Music, Play, Save, Shuffle } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { AlbumDetail, AlbumInfo } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/toastContext';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { useTrackActions } from '../components/library/trackActionsContext';
import { usePlayer } from '../components/player/playerContext';
import { TrackIndexButton } from '../components/player/TrackIndexButton';
import { DataTable } from '../components/table/DataTable';
import { HeaderIcon } from '../components/table/HeaderIcon';
import { TrackTitleCell } from '../components/table/TrackTitleCell';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState, LoadFailed } from '../components/ui/EmptyState';
import { useDetail } from '../hooks/useDetail';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { getCachedAlbumDetail, setCachedAlbumDetail } from '../utils/detailCache';
import { errorMessage, formatBytes, trackCount } from '../utils/formatters';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { useSaveShortcut } from '../hooks/useSaveShortcut';

interface AlbumEditPageProps {
  albumKey: string;
  onBack: () => void;
}

const NO_ALBUM_LABEL = '(No Album)';

const getSharedArtist = (detail: AlbumDetail) => (detail.album.artists.length === 1 ? detail.album.artists[0] : '');
const ALBUM_SIDEBAR_PAGE_SIZE = 25;

async function fetchAlbum(albumKey: string, force: boolean): Promise<AlbumDetail> {
  const cached = force ? null : getCachedAlbumDetail(albumKey);
  if (cached) return cached;
  const detail = await mp3Api.getAlbum(albumKey);
  setCachedAlbumDetail(albumKey, detail);
  return detail;
}

export function AlbumEditPage({ albumKey, onBack }: AlbumEditPageProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, showInfo, clearToast } = useToast();

  const [albumName, setAlbumName] = useState('');
  const [artist, setArtist] = useState('');
  const [, refreshCoverPreview] = useReducer((count: number) => count + 1, 0);

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
    outputFilename: 'album-cover.jpg',
  });

  const applyAlbumDetail = (detail: AlbumDetail) => {
    resetCoverState();
    const editableName = detail.album.album_name === NO_ALBUM_LABEL ? '' : detail.album.album_name;
    setAlbumName(editableName);
    setArtist(getSharedArtist(detail));
  };

  const { detail: albumDetail, current, missing, failed, reload } = useDetail(albumKey, fetchAlbum, applyAlbumDetail, (err) =>
    showError(errorMessage(err, 'Failed to load album')),
  );

  useEffect(() => subscribeAppEvent('library-changed', refreshCoverPreview), []);

  const loadedAlbumName =
    albumDetail && albumDetail.album.album_name !== NO_ALBUM_LABEL ? albumDetail.album.album_name : '';
  const loadedArtist = albumDetail ? getSharedArtist(albumDetail) : '';
  const isArtistDirty = artist !== loadedArtist;
  const isDirty = albumDetail !== null && (albumName !== loadedAlbumName || isArtistDirty || coverFile !== null);

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isDirty);
  useSaveShortcut(() => void handleSave(), !(saving || !current || !isDirty));
  const player = usePlayer();
  const { favorites, openMenu, menuFilename } = useTrackActions();

  const handleSave = async () => {
    if (!albumDetail || !current) return;

    setSaving(true);
    showInfo('Saving album changes...');

    try {
      const renameResult = await mp3Api.updateAlbum(albumKey, {
        album_name: albumName,
        artist: isArtistDirty ? artist : undefined,
      });
      const targetAlbumKey = renameResult.album_key;

      if (coverFile) {
        await mp3Api.updateAlbumCover(targetAlbumKey, coverFile);
      }

      emitAppEvent('library-changed');

      if (targetAlbumKey !== albumKey) {
        allowNavigation();
        navigate(`/albums/${encodeURIComponent(targetAlbumKey)}`, { replace: true });
        return;
      }

      await reload();
      showSuccess('Album updated successfully!');
    } catch (err) {
      showError(errorMessage(err, 'Failed to save album'));
    } finally {
      setSaving(false);
    }
  };

  if (missing) return <div className="page"><EmptyState icon={DiscAlbum} label="Album not found" /></div>;
  if (failed) return <div className="page"><LoadFailed label="Couldn't load the album" onRetry={() => void reload()} /></div>;
  if (!albumDetail) return <div className="page"><Spinner /></div>;

  const existingCoverPreview = albumDetail.album.has_cover ? mp3Api.getAlbumCoverUrl(albumDetail.album.album_key, 'full') : null;
  const effectiveCoverPreview = coverPreview || existingCoverPreview;
  const getAlbumSubtitle = (album: AlbumInfo) => {
    const subtitleParts = [
      `${trackCount(album.track_count)}`,
      album.artists.length > 0 ? album.artists.slice(0, 2).join(', ') : '',
    ].filter(Boolean);

    return subtitleParts.join(' • ');
  };

  return (
    <div className="page">
      <div className="details-layout">
        <InfiniteSidebarList<AlbumInfo>
          backLabel="Back to albums"
          onBack={onBack}
          activeKey={albumKey}
          getItemKey={(album) => album.album_key}
          getItemTitle={(album) => album.album_name || NO_ALBUM_LABEL}
          getItemSubtitle={getAlbumSubtitle}
          onSelect={(album) => navigate(`/albums/${encodeURIComponent(album.album_key)}`)}
          fetchPage={async ({ page, limit, search }) => {
            const response = await mp3Api.listAlbumsPaged({
              page,
              limit,
              search,
              sortBy: 'album_name',
              sortDirection: 'asc',
            });

            return {
              items: response.items,
              total: response.meta.total,
              totalPages: response.meta.total_pages,
            };
          }}
          emptyMessage="No matches"
          pinnedItem={albumDetail.album}
          pageSize={ALBUM_SIDEBAR_PAGE_SIZE}
          searchDebounceMs={300}
        />

        <section className="details-main">

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
              aria-label="Change album cover"
              title="Change album cover"
            >
              {effectiveCoverPreview ? (
                <img src={effectiveCoverPreview} alt="" />
              ) : (
                <div className="no-cover-large"><DiscAlbum aria-hidden="true" /></div>
              )}
              <span className="cover-preview__overlay" aria-hidden="true">
                <ImagePlus />
              </span>
            </button>

            <div className="metadata-section">
              <IconField
                icon={DiscAlbum}
                label="Album name"
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                disabled={saving || !current}
              />
              <IconField
                icon={MicVocal}
                label="Artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                disabled={saving || !current}
              />

              <div className="album-chips">
                <span className="album-chip" title="Tracks">
                  <Music aria-hidden="true" />
                  {albumDetail.album.track_count}
                </span>
                <span className="album-chip" title="Size">
                  <HardDrive aria-hidden="true" />
                  {formatBytes(albumDetail.album.total_size)}
                </span>
                {albumDetail.album.artists.length > 1 && (
                  <span className="album-chip album-chip--wide" title={albumDetail.album.artists.join(', ')}>
                    <MicVocal aria-hidden="true" />
                    <span className="album-chip__text">{albumDetail.album.artists.join(', ')}</span>
                  </span>
                )}
              </div>

              <div className="metadata-actions">
                <IconButton
                  icon={Play}
                  label="Play album"
                  onClick={() => player.playTracks(albumDetail.tracks, 0)}
                  disabled={albumDetail.tracks.length === 0}
                />
                <IconButton
                  icon={Shuffle}
                  label="Shuffle album"
                  onClick={() => player.playTracks(albumDetail.tracks, undefined, { shuffle: true })}
                  disabled={albumDetail.tracks.length === 0}
                />
                <IconButton
                  icon={Save}
                  label="Save"
                  variant="primary"
                  onClick={() => void handleSave()}
                  busy={saving}
                  disabled={saving || !current || !isDirty}
                />
              </div>
            </div>
          </div>

          <DataTable
            className="album-tracks-table"
            items={albumDetail.tracks}
            getRowKey={(track) => track.filename}
            getRowClassName={(track) =>
              [player.isCurrent(track.filename) ? 'is-current' : '', menuFilename === track.filename ? 'is-menu-open' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            onRowMenu={(track, event) =>
              openMenu(event, track, {
                play: () => player.playTracks(albumDetail.tracks, albumDetail.tracks.indexOf(track)),
                onDeleted: (deleted) => {
                  if (deleted.length >= albumDetail.tracks.length) {
                    onBack();
                    return;
                  }
                  void reload();
                },
              })
            }
            emptyMessage="No tracks"
            columns={[
              {
                key: 'index',
                header: <span className="sr-only">Play</span>,
                width: '4rem',
                render: (track, index) => (
                  <TrackIndexButton
                    index={index + 1}
                    label={`Play ${track.title || track.filename}`}
                    isCurrent={player.isCurrent(track.filename)}
                    isPlaying={player.state.isPlaying}
                    onPlay={() => player.playTracks(albumDetail.tracks, index)}
                    onToggle={player.togglePlay}
                  />
                ),
              },
              {
                key: 'title',
                header: <HeaderIcon label="Title" icon={Music} />,
                render: (track) => (
                  <TrackTitleCell
                    title={track.title || '-'}
                    subtitle={track.artist ?? undefined}
                    favorite={favorites.has(track.filename)}
                  />
                ),
              },
              {
                key: 'artist',
                header: <HeaderIcon label="Artist" icon={MicVocal} />,
                hideBelow: 'sm',
                render: (track) => <span className="table-cell-ellipsis" title={track.artist || '-'}>{track.artist || '-'}</span>,
              },
              {
                key: 'filename',
                header: <HeaderIcon label="File name" icon={FileAudio} />,
                hideBelow: 'md',
                render: (track) => <span className="library-filename" title={track.filename}>{track.filename}</span>,
              },
              {
                key: 'size',
                header: <HeaderIcon label="Size" icon={HardDrive} />,
                width: '96px',
                hideBelow: 'sm',
                render: (track) => formatBytes(track.file_size),
              },
            ]}
          />
        </section>
      </div>

      <DiscardChangesDialog blocker={blocker} />

      <CoverCropModal {...cropModalProps} />
    </div>
  );
}
