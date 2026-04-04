import { useEffect, useState, useRef } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { mp3Api } from '../api/mp3Api';
import type { MP3Info } from '../api/mp3Api';

interface EditPageProps {
  filename: string;
  onBack: () => void;
}

const COVER_SIZE = 500;

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
    file: new File([blob], 'cover.jpg', { type: 'image/jpeg' }),
    preview,
  };
};

export function EditPage({ filename, onBack }: EditPageProps) {
  const [mp3, setMp3] = useState<MP3Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [newFilename, setNewFilename] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);

  useEffect(() => {
    loadMp3();
  }, [filename]);

  const loadMp3 = async () => {
    try {
      setLoading(true);
      const info = await mp3Api.getInfo(filename);
      setMp3(info);
      setTitle(info.title || '');
      setArtist(info.artist || '');
      setAlbum(info.album || '');
      setNewFilename(info.filename);
      if (info.has_cover) {
        setCoverPreview(mp3Api.getCoverUrl(filename));
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load MP3 info' });
    } finally {
      setLoading(false);
    }
  };

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
    setSaving(true);
    setMessage(null);

    try {
      // Update metadata
      const result = await mp3Api.updateMetadata(filename, {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        new_filename: newFilename !== filename ? newFilename : undefined,
      });

      // Update cover if changed
      if (newCoverFile) {
        await mp3Api.updateCover(result.filename, newCoverFile);
      }

      setMessage({ type: 'success', text: 'Saved successfully!' });
      
      // If filename changed, go back to library
      if (result.filename !== filename) {
        setTimeout(() => onBack(), 1000);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!mp3) return <div className="page"><p>MP3 not found</p></div>;

  return (
    <div className="page">
      <button onClick={onBack} className="btn-secondary" style={{ marginBottom: '1rem' }}>
        ← Back to Library
      </button>

      <h1>Edit: {mp3.filename}</h1>

      <div className="edit-container">
        <div className="cover-section">
          <div className="cover-preview">
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" />
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
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary">
            Change Cover
          </button>
          <p className="input-help">Choose image, crop/zoom, then save as 500x500 cover.</p>
        </div>

        <div className="metadata-section">
          <div className="form-group">
            <label htmlFor="filename">Filename</label>
            <input
              id="filename"
              type="text"
              value={newFilename}
              onChange={(e) => setNewFilename(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="artist">Artist</label>
            <input
              id="artist"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="album">Album</label>
            <input
              id="album"
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              disabled={saving}
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>

      <div className="audio-player">
        <h3>Preview</h3>
        <audio controls src={mp3Api.getFileUrl(filename)} />
      </div>

      {isCropModalOpen && cropSource && (
        <div className="crop-modal-backdrop">
          <div className="crop-modal">
            <h3>Crop Cover</h3>
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
            <label className="crop-zoom-label" htmlFor="editCropZoom">
              Zoom: {zoom.toFixed(2)}x
            </label>
            <input
              id="editCropZoom"
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
