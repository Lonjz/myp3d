import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscAlbum, HardDrive, ImagePlus, MicVocal, Music, Save, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { AlbumDetail, AlbumInfo } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { getCachedAlbumDetail, setCachedAlbumDetail } from '../utils/detailCache';
import { formatBytes } from '../utils/formatters';

interface AlbumEditPageProps {
  albumKey: string;
  onBack: () => void;
}

const NO_ALBUM_LABEL = '(No Album)';
const ALBUM_SIDEBAR_PAGE_SIZE = 25;

export function AlbumEditPage({ albumKey, onBack }: AlbumEditPageProps) {
  const navigate = useNavigate();
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, showInfo, clearToast } = useToast();

  const [albumName, setAlbumName] = useState('');
  const [, refreshCoverPreview] = useReducer((count: number) => count + 1, 0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    coverFile,
    coverPreview,
    cropSource,
    crop,
    zoom,
    isCropModalOpen,
    isApplyingCrop,
    setCrop,
    setZoom,
    handleCropComplete,
    handleCoverChange,
    handleApplyCrop,
    handleCancelCrop,
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
    outputFilename: 'album-cover.jpg',
  });

  const applyAlbumDetail = (detail: AlbumDetail) => {
    setAlbumDetail(detail);

    const editableName = detail.album.album_name === NO_ALBUM_LABEL ? '' : detail.album.album_name;
    setAlbumName(editableName);
  };

  const loadAlbum = async (targetKey: string, options?: { clearToast?: boolean; force?: boolean }) => {
    const force = options?.force ?? false;
    if (options?.clearToast ?? true) {
      clearToast();
    }

    if (!force) {
      const cached = getCachedAlbumDetail(targetKey);
      if (cached) {
        applyAlbumDetail(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const detail = await mp3Api.getAlbum(targetKey);
      setCachedAlbumDetail(targetKey, detail);
      applyAlbumDetail(detail);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load album');
      setAlbumDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resetCoverState();
    loadAlbum(albumKey);
  }, [albumKey]);

  useEffect(() => subscribeAppEvent('library-changed', refreshCoverPreview), []);

  const loadedAlbumName =
    albumDetail && albumDetail.album.album_name !== NO_ALBUM_LABEL ? albumDetail.album.album_name : '';
  const isDirty = albumDetail !== null && (albumName !== loadedAlbumName || coverFile !== null);

  const { blocker, allowNavigation } = useUnsavedChangesGuard(isDirty);

  const handleSave = async () => {
    if (!albumDetail) {
      return;
    }

    setSaving(true);
    showInfo('Saving album changes...');

    try {
      const renameResult = await mp3Api.updateAlbum(albumKey, { album_name: albumName });
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

      await loadAlbum(targetAlbumKey, { clearToast: false, force: true });
      resetCoverState();
      showSuccess('Album updated successfully!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save album');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !albumDetail) return <div className="page"><Spinner /></div>;
  if (!albumDetail) return <div className="page"><p className="page-empty">Album not found</p></div>;

  const existingCoverPreview = albumDetail.album.has_cover ? mp3Api.getAlbumCoverUrl(albumDetail.album.album_key) : null;
  const effectiveCoverPreview = coverPreview || existingCoverPreview;
  const getAlbumSubtitle = (album: AlbumInfo) => {
    const subtitleParts = [
      `${album.track_count} track${album.track_count === 1 ? '' : 's'}`,
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
          <h1 className="details-title">{albumDetail.album.album_name}</h1>

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
              disabled={saving}
              aria-label="Change album cover"
              title="Change album cover"
            >
              {effectiveCoverPreview ? (
                <img src={effectiveCoverPreview} alt="" />
              ) : (
                <div className="no-cover-large">🎵</div>
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
                disabled={saving}
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
                {albumDetail.album.artists.length > 0 && (
                  <span className="album-chip album-chip--wide" title={albumDetail.album.artists.join(', ')}>
                    <MicVocal aria-hidden="true" />
                    <span className="album-chip__text">{albumDetail.album.artists.join(', ')}</span>
                  </span>
                )}
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary metadata-save">
                {saving ? <Spinner inline /> : <Save aria-hidden="true" />}
                Save
              </button>
            </div>
          </div>

          <div className="library-table-wrap glass glass--strong">
            <table className="library-table album-tracks-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Artist</th>
                  <th>File name</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {albumDetail.tracks.map((track) => (
                  <tr key={track.filename}>
                    <td><span className="table-cell-ellipsis">{track.title || '-'}</span></td>
                    <td><span className="table-cell-ellipsis">{track.artist || '-'}</span></td>
                    <td><span className="library-filename">{track.filename}</span></td>
                    <td>{formatBytes(track.file_size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        icon={TriangleAlert}
        title="Discard changes?"
        cancelLabel="Stay"
        cancelIcon={Undo2}
        confirmLabel="Discard"
        confirmIcon={Trash2}
        tone="danger"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />

      <CoverCropModal
        isOpen={isCropModalOpen}
        cropSource={cropSource}
        crop={crop}
        zoom={zoom}
        isApplyingCrop={isApplyingCrop}
        zoomInputId="albumCropZoom"
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleCropComplete}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
}
