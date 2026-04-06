import { useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest, YouTubeSearchResult } from '../api/mp3Api';
import { CoverUploadSquare } from '../components/CoverUploadSquare';

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

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read selected cover image'));
    reader.readAsDataURL(file);
  });

const getVideoIdFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }
    return parsed.searchParams.get('v') || '';
  } catch {
    return '';
  }
};

const formatDuration = (duration: number | null): string => {
  if (!duration || duration < 1) return '';
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export function QueryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedResult, setSelectedResult] = useState<YouTubeSearchResult | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState('');

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

  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const hasResults = useMemo(() => searchResults.length > 0, [searchResults.length]);

  const applySelectedResult = (result: YouTubeSearchResult) => {
    const fallbackVideoId = getVideoIdFromUrl(result.url);

    setSelectedResult(result);
    setSelectedVideoId(result.video_id || fallbackVideoId);
    setUrl(result.url);
    setTitle(result.title || '');
    setArtist(result.artist || '');
    setAlbum(result.album || '');

    setMessage(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = searchQuery.trim();
    if (!normalized) {
      setSearchError('Please enter a search query');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const results = await mp3Api.searchYouTube(normalized, 20);
      setSearchResults(results);

      if (results.length === 0) {
        setSelectedResult(null);
        setSelectedVideoId('');
        setSearchError('No videos found. Try another search.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'YouTube search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleCoverFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Cover file must be an image' });
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setMessage({ type: 'error', text: 'Please select a YouTube video or enter a URL' });
      return;
    }

    setDownloading(true);
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

      setUrl('');
      setCustomFilename('');
      setTitle('');
      setArtist('');
      setAlbum('');
      setCoverImageBase64(undefined);
      setCoverPreview(null);
      setCropSource(null);
      setIsCropModalOpen(false);
      setSelectedResult(null);
      setSelectedVideoId('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Download failed' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <h1>Youtube Search</h1>

      <div className="query-layout">
        <aside className="query-sidebar">
          <form onSubmit={handleSearch} className="query-search-form">
            <div className="form-group">
              <label htmlFor="queryInput">Search YouTube</label>
              <input
                id="queryInput"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Song, artist, album, live version..."
                disabled={searching}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchError && <p className="query-error">{searchError}</p>}

          <div className="query-results-header">
            <h3>Results</h3>
            <span>{hasResults ? `${searchResults.length} found` : 'No results yet'}</span>
          </div>

          <div className="query-results-list">
            {searchResults.map((result) => {
              const isActive = selectedResult?.video_id === result.video_id;
              return (
                <button
                  key={`${result.video_id}-${result.url}`}
                  type="button"
                  className={`query-result-item ${isActive ? 'active' : ''}`}
                  onClick={() => applySelectedResult(result)}
                >
                  <div className="query-result-thumb-wrap">
                    {result.thumbnail_url ? (
                      <img
                        className="query-result-thumb"
                        src={result.thumbnail_url}
                        alt={`${result.title} thumbnail`}
                      />
                    ) : (
                      <div className="query-result-thumb query-result-thumb-placeholder">🎵</div>
                    )}
                  </div>
                  <div className="query-result-text">
                    <span className="query-result-title">{result.title}</span>
                    <span className="query-result-subtitle">{result.artist || 'Unknown Artist'}</span>
                    {result.duration ? (
                      <span className="query-result-duration">{formatDuration(result.duration)}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="query-main">
          <div className="query-preview-card">
            <h3>Video Preview</h3>
            {selectedVideoId ? (
              <div className="query-player-wrap">
                <iframe
                  className="query-player-iframe"
                  src={`https://www.youtube.com/embed/${selectedVideoId}`}
                  title="YouTube preview player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="query-empty-player">Select a result to preview it here.</div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="download-form">
            <div className="download-config-shell">
              <div className="form-group download-url-row">
                <label htmlFor="queryUrl">YouTube URL *</label>
                <input
                  id="queryUrl"
                  type="text"
                  value={url}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    setUrl(nextUrl);
                    setSelectedVideoId(getVideoIdFromUrl(nextUrl));
                  }}
                  placeholder="https://youtube.com/watch?v=..."
                  disabled={downloading}
                />
              </div>

              <div className="download-config-grid">
                <div className="download-meta-column">
                  <div className="form-group">
                    <label htmlFor="queryCustomFilename">Custom Filename (optional)</label>
                    <input
                      id="queryCustomFilename"
                      type="text"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder="my-song"
                      disabled={downloading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="queryTitle">Title</label>
                    <input
                      id="queryTitle"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Song Title"
                      disabled={downloading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="queryArtist">Artist</label>
                    <input
                      id="queryArtist"
                      type="text"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      placeholder="Artist Name"
                      disabled={downloading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="queryAlbum">Album</label>
                    <input
                      id="queryAlbum"
                      type="text"
                      value={album}
                      onChange={(e) => setAlbum(e.target.value)}
                      placeholder="Album Name"
                      disabled={downloading}
                    />
                  </div>
                </div>

                <div className="download-cover-column">
                  <CoverUploadSquare
                    inputId="queryCoverImage"
                    label="Cover Image (optional)"
                    previewUrl={coverPreview}
                    disabled={downloading}
                    onSelectFile={handleCoverFileSelect}
                    onClear={handleRemoveCover}
                    emptyText="Click to upload cover"
                    helpText="Image is cropped to 500x500."
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={downloading} className="btn-primary">
              {downloading ? 'Downloading...' : 'Download MP3'}
            </button>

            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
          </form>
        </section>
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
            <label className="crop-zoom-label" htmlFor="queryCropZoom">
              Zoom: {zoom.toFixed(2)}x
            </label>
            <input
              id="queryCropZoom"
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
