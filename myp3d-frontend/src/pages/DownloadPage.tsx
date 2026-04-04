import { useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest } from '../api/mp3Api';

const COVER_SIZE = 500;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load selected image'));
    image.src = src;
  });

const getCroppedCoverDataUrl = async (imageSrc: string, cropArea: Area): Promise<string> => {
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

  return canvas.toDataURL('image/jpeg', 0.92);
};

export function DownloadPage() {
  const [url, setUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [coverImageBase64, setCoverImageBase64] = useState<string | undefined>(undefined);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read selected cover image'));
      reader.readAsDataURL(file);
    });

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
      const croppedImage = await getCroppedCoverDataUrl(cropSource, croppedAreaPixels);
      setCoverImageBase64(croppedImage);
      setCoverPreview(croppedImage);
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

  const handleRemoveCover = () => {
    setCoverImageBase64(undefined);
    setCoverPreview(null);
    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setMessage({ type: 'error', text: 'Please enter a YouTube URL' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const request: DownloadRequest = {
        url: url.trim(),
        custom_filename: customFilename.trim() || undefined,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        cover_image_base64: coverImageBase64,
      };

      const result = await mp3Api.download(request);
      setMessage({ type: 'success', text: `Downloaded: ${result.filename}` });
      
      // Clear form
      setUrl('');
      setCustomFilename('');
      setTitle('');
      setArtist('');
      setAlbum('');
      setCoverImageBase64(undefined);
      setCoverPreview(null);
      setCropSource(null);
      setIsCropModalOpen(false);
      if (coverInputRef.current) {
        coverInputRef.current.value = '';
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Download failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Download MP3</h1>
      <form onSubmit={handleSubmit} className="download-form">
        <div className="form-group">
          <label htmlFor="url">YouTube URL *</label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="customFilename">Custom Filename (optional)</label>
          <input
            id="customFilename"
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder="my-song"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Song Title"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="artist">Artist</label>
          <input
            id="artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist Name"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="album">Album</label>
          <input
            id="album"
            type="text"
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            placeholder="Album Name"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="coverImage">Cover Image (optional)</label>
          <div className="download-cover-field">
            <input
              id="coverImage"
              type="file"
              accept="image/*"
              ref={coverInputRef}
              onChange={handleCoverChange}
              disabled={loading}
              className="hidden-file-input"
            />
            <div className="download-cover-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => coverInputRef.current?.click()}
                disabled={loading}
              >
                Browse Image
              </button>
              {coverPreview && (
                <button type="button" className="btn-secondary" onClick={handleRemoveCover} disabled={loading}>
                  Remove Cover
                </button>
              )}
            </div>
            <div className="download-cover-preview">
              {coverPreview ? (
                <img src={coverPreview} alt="Selected cover preview" />
              ) : (
                <div className="download-cover-placeholder">No cover selected</div>
              )}
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Downloading...' : 'Download MP3'}
        </button>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </form>

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
            <label className="crop-zoom-label" htmlFor="cropZoom">
              Zoom: {zoom.toFixed(2)}x
            </label>
            <input
              id="cropZoom"
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
