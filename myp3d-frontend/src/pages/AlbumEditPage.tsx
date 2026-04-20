import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumDetail, AlbumInfo } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { useToast } from '../components/messages/ToastProvider';
import { InfiniteSidebarList } from '../components/sidebar/InfiniteSidebarList';

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
  const [existingCoverPreview, setExistingCoverPreview] = useState<string | null>(null);

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
    handleCoverFileSelect,
    handleApplyCrop,
    handleCancelCrop,
    resetCoverState,
  } = useCoverImageCrop({
    onError: showError,
    onClearError: clearToast,
    outputFilename: 'album-cover.jpg',
  });

  const loadAlbum = async (targetKey: string, options?: { clearToast?: boolean }) => {
    try {
      setLoading(true);
      if (options?.clearToast ?? true) {
        clearToast();
      }
      const detail = await mp3Api.getAlbum(targetKey);
      setAlbumDetail(detail);

      const editableName = detail.album.album_name === NO_ALBUM_LABEL ? '' : detail.album.album_name;
      setAlbumName(editableName);

      if (detail.album.has_cover) {
        const cacheBuster = Date.now();
        setExistingCoverPreview(`${mp3Api.getAlbumCoverUrl(targetKey)}?t=${cacheBuster}`);
      } else {
        setExistingCoverPreview(null);
      }
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

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    await handleCoverFileSelect(file);
    e.target.value = '';
  };

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

      if (targetAlbumKey !== albumKey) {
        navigate(`/albums/${encodeURIComponent(targetAlbumKey)}`, { replace: true });
        return;
      }

      await loadAlbum(targetAlbumKey, { clearToast: false });
      showSuccess('Album updated successfully!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save album');
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading && !albumDetail) return <div className="page"><p>Loading album...</p></div>;
  if (!albumDetail) return <div className="page"><p>Album not found</p></div>;

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
          title="Edit Another Album"
          backLabel="← Back to Albums"
          onBack={onBack}
          searchPlaceholder="Search album or artist"
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
          emptyMessage="No matching albums."
          pinnedItem={albumDetail.album}
          pageSize={ALBUM_SIDEBAR_PAGE_SIZE}
          searchDebounceMs={300}
        />

        <section className="details-main">
          <h1>Edit Album: {albumDetail.album.album_name}</h1>
          {loading && <p className="input-help">Refreshing album data...</p>}

          <div className="edit-container">
            <div className="cover-section">
              <div className="cover-preview">
                {effectiveCoverPreview ? (
                  <img src={effectiveCoverPreview} alt="Album cover" />
                ) : (
                  <div className="no-cover-large">🎵</div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleCoverChange}
                style={{ display: 'none' }}
              />
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" disabled={saving}>
                Change Album Cover
              </button>
              <p className="input-help">Choose image, crop/zoom, then save to apply to all tracks in this album.</p>
            </div>

            <div className="metadata-section">
              <div className="form-group">
                <label htmlFor="albumName">Album Name</label>
                <input
                  id="albumName"
                  type="text"
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  disabled={saving}
                  placeholder="Leave blank to clear album metadata"
                />
              </div>

              <div className="album-stats-grid">
                <div className="album-stat-card">
                  <span className="album-stat-label">Tracks</span>
                  <strong>{albumDetail.album.track_count}</strong>
                </div>
                <div className="album-stat-card">
                  <span className="album-stat-label">Total Size</span>
                  <strong>{formatSize(albumDetail.album.total_size)}</strong>
                </div>
                <div className="album-stat-card album-stat-card-wide">
                  <span className="album-stat-label">Artists</span>
                  <strong>{albumDetail.album.artists.length > 0 ? albumDetail.album.artists.join(', ') : '-'}</strong>
                </div>
              </div>

              <button onClick={handleSave} disabled={saving} className="btn-primary">
                Save Album Changes
              </button>
            </div>
          </div>

          <div className="audio-player">
            <h3>Tracks in this Album</h3>
            <div className="library-table-wrap">
              <table className="library-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Filename</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {albumDetail.tracks.map((track) => (
                    <tr key={track.filename}>
                      <td>{track.title || '-'}</td>
                      <td>{track.artist || '-'}</td>
                      <td className="library-filename">{track.filename}</td>
                      <td>{formatSize(track.file_size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

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
