import { useMemo, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest, YouTubeSearchResult } from '../api/mp3Api';
import { CoverCropModal } from '../components/CoverCropModal';
import { DownloadConfigSection } from '../components/DownloadConfigSection';
import { useCoverImageCrop } from '../components/useCoverImageCrop';

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

  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const {
    coverImageBase64,
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
    handleRemoveCover,
    resetCoverState,
  } = useCoverImageCrop({
    onError: (text) => setMessage({ type: 'error', text }),
    onClearError: () => setMessage(null),
  });

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
      resetCoverState();
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
            <DownloadConfigSection
              idPrefix="query"
              url={url}
              onUrlChange={(nextUrl) => {
                setUrl(nextUrl);
                setSelectedVideoId(getVideoIdFromUrl(nextUrl));
              }}
              customFilename={customFilename}
              onCustomFilenameChange={setCustomFilename}
              title={title}
              onTitleChange={setTitle}
              artist={artist}
              onArtistChange={setArtist}
              album={album}
              onAlbumChange={setAlbum}
              coverPreview={coverPreview}
              onCoverSelect={handleCoverFileSelect}
              onCoverClear={handleRemoveCover}
              disabled={downloading}
            />

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

      <CoverCropModal
        isOpen={isCropModalOpen}
        cropSource={cropSource}
        crop={crop}
        zoom={zoom}
        isApplyingCrop={isApplyingCrop}
        zoomInputId="queryCropZoom"
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={handleCropComplete}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
}
