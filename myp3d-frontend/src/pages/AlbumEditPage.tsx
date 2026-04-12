import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumDetail, AlbumInfo } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';

interface AlbumEditPageProps {
  albumKey: string;
  onBack: () => void;
}

const NO_ALBUM_LABEL = '(No Album)';

export function AlbumEditPage({ albumKey, onBack }: AlbumEditPageProps) {
  const navigate = useNavigate();
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [albumSearch, setAlbumSearch] = useState('');

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
    onError: (text) => setMessage({ type: 'error', text }),
    onClearError: () => setMessage(null),
    outputFilename: 'album-cover.jpg',
  });

  const loadAlbums = async () => {
    try {
      const list = await mp3Api.listAlbums();
      setAlbums(list);
    } catch {
      setAlbums([]);
    }
  };

  const loadAlbum = async (targetKey: string) => {
    try {
      setLoading(true);
      setMessage(null);
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
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load album' });
      setAlbumDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resetCoverState();
    loadAlbum(albumKey);
  }, [albumKey]);

  useEffect(() => {
    loadAlbums();
  }, []);

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
    setMessage(null);

    try {
      const renameResult = await mp3Api.updateAlbum(albumKey, { album_name: albumName });
      const targetAlbumKey = renameResult.album_key;

      if (coverFile) {
        await mp3Api.updateAlbumCover(targetAlbumKey, coverFile);
      }

      setMessage({ type: 'success', text: 'Album updated successfully!' });

      if (targetAlbumKey !== albumKey) {
        navigate(`/albums/${encodeURIComponent(targetAlbumKey)}`, { replace: true });
        return;
      }

      await loadAlbum(targetAlbumKey);
      await loadAlbums();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save album' });
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

  const normalizedAlbumSearch = albumSearch.trim().toLowerCase();
  const effectiveCoverPreview = coverPreview || existingCoverPreview;
  const visibleAlbums = albums.filter((album) => {
    if (!normalizedAlbumSearch) return true;
    return (
      (album.album_name || '').toLowerCase().includes(normalizedAlbumSearch) ||
      album.artists.join(' ').toLowerCase().includes(normalizedAlbumSearch)
    );
  });

  return (
    <div className="page">
      <div className="details-layout">
        <aside className="details-sidebar">
          <button onClick={onBack} className="btn-secondary details-back-btn">
            ← Back to Albums
          </button>

          <h3>Edit Another Album</h3>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={albumSearch}
              onChange={(e) => setAlbumSearch(e.target.value)}
              placeholder="Search album or artist"
            />
          </div>

          <div className="details-song-list">
            {visibleAlbums.map((album) => {
              const isActive = album.album_key === albumKey;
              const subtitleParts = [
                `${album.track_count} track${album.track_count === 1 ? '' : 's'}`,
                album.artists.length > 0 ? album.artists.slice(0, 2).join(', ') : '',
              ].filter(Boolean);

              return (
                <button
                  key={album.album_key}
                  type="button"
                  className={`details-song-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(`/albums/${encodeURIComponent(album.album_key)}`)}
                  disabled={isActive}
                >
                  <span className="details-song-title">{album.album_name || NO_ALBUM_LABEL}</span>
                  <span className="details-song-subtitle">{subtitleParts.join(' • ')}</span>
                </button>
              );
            })}

            {visibleAlbums.length === 0 && (
              <p className="input-help">No matching albums.</p>
            )}
          </div>
        </aside>

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
                {saving ? 'Saving...' : 'Save Album Changes'}
              </button>

              {message && (
                <div className={`message ${message.type}`}>
                  {message.text}
                </div>
              )}
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
