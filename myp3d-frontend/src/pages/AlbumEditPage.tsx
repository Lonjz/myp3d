import { useEffect, useState, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { useNavigate } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { AlbumDetail, AlbumInfo } from '../api/mp3Api';

interface AlbumEditPageProps {
  albumKey: string;
  onBack: () => void;
}

const COVER_SIZE = 500;
const NO_ALBUM_LABEL = '(No Album)';

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read selected cover image'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load selected image'));
    image.src = src;
  });

const getCroppedCover = async (
  imageSrc: string,
  cropArea: Area,
): Promise<{ file: File; preview: string }> => {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = COVER_SIZE;
  canvas.height = COVER_SIZE;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to initialize crop canvas');
  }

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    COVER_SIZE,
    COVER_SIZE,
  );

  const preview = canvas.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
  });

  if (!blob) {
    throw new Error('Failed to create cropped cover image');
  }

  return {
    file: new File([blob], 'album-cover.jpg', { type: 'image/jpeg' }),
    preview,
  };
};

export function AlbumEditPage({ albumKey, onBack }: AlbumEditPageProps) {
  const navigate = useNavigate();
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [albums, setAlbums] = useState<AlbumInfo[]>([]);
  const [albumSearch, setAlbumSearch] = useState('');

  const [albumName, setAlbumName] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);

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
        setCoverPreview(`${mp3Api.getAlbumCoverUrl(targetKey)}?t=${cacheBuster}`);
      } else {
        setCoverPreview(null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load album' });
      setAlbumDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNewCoverFile(null);
    setCropSource(null);
    setIsCropModalOpen(false);
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

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Cover file must be an image' });
      e.target.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setCropSource(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsCropModalOpen(true);
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Invalid cover image' });
    } finally {
      e.target.value = '';
    }
  };

  const handleApplyCrop = async () => {
    if (!cropSource || !croppedAreaPixels) {
      setMessage({ type: 'error', text: 'Please adjust the crop before applying' });
      return;
    }

    try {
      setIsApplyingCrop(true);
      const cropped = await getCroppedCover(cropSource, croppedAreaPixels);
      setNewCoverFile(cropped.file);
      setCoverPreview(cropped.preview);
      setIsCropModalOpen(false);
      setCropSource(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to crop image' });
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const handleCancelCrop = () => {
    setIsCropModalOpen(false);
    setCropSource(null);
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

      if (newCoverFile) {
        await mp3Api.updateAlbumCover(targetAlbumKey, newCoverFile);
      }

      setNewCoverFile(null);
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
                {coverPreview ? (
                  <img src={coverPreview} alt="Album cover" />
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

      {isCropModalOpen && cropSource && (
        <div className="crop-modal-backdrop">
          <div className="crop-modal">
            <h3>Crop Album Cover</h3>
            <div className="cropper-wrap">
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                minZoom={1}
                maxZoom={3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                objectFit="contain"
              />
            </div>
            <label className="crop-zoom-label" htmlFor="albumCropZoom">
              Zoom: {zoom.toFixed(2)}x
            </label>
            <input
              id="albumCropZoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="crop-zoom-slider"
            />
            <div className="crop-actions">
              <button type="button" className="btn-secondary" onClick={handleCancelCrop} disabled={isApplyingCrop}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleApplyCrop} disabled={isApplyingCrop}>
                {isApplyingCrop ? 'Applying...' : 'Use Crop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
