import { useMemo, useState, useEffect, useRef } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { DownloadRequest, YouTubeSearchResult } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { useCoverImageCrop } from '../components/cover/useCoverImageCrop';
import { DownloadConfigSection } from '../components/download/DownloadConfigSection';
import { TrimRangeSection } from '../components/download/TrimRangeSection';
import { useToast } from '../components/messages/ToastProvider';
import { formatDuration } from '../utils/formatters';

type YouTubePlayer = any;

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

const loadYouTubeApi = (() => {
  let promise: Promise<any> | null = null;

  return () => {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('YouTube API is only available in the browser'));
    }

    const existing = (window as any).YT;
    if (existing && existing.Player) {
      return Promise.resolve(existing);
    }

    if (promise) {
      return promise;
    }

    promise = new Promise((resolve, reject) => {
      const scriptId = 'youtube-iframe-api';
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

      if (!existingScript) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => reject(new Error('Failed to load YouTube preview'));
        document.body.appendChild(script);
      }

      const previousReady = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        previousReady?.();
        const ready = (window as any).YT;
        if (ready && ready.Player) {
          resolve(ready);
        } else {
          reject(new Error('YouTube preview unavailable'));
        }
      };
    });

    return promise;
  };
})();

export function QueryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);

  const [selectedResult, setSelectedResult] = useState<YouTubeSearchResult | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState('');

  const [url, setUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isSamplePlaying, setIsSamplePlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [sliderMode, setSliderMode] = useState<'range' | 'playhead'>('range');
  const [loopEnabled, setLoopEnabled] = useState(true);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const monitorRef = useRef<number | null>(null);
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  const isSamplePlayingRef = useRef(isSamplePlaying);
  const loopEnabledRef = useRef(loopEnabled);

  const [downloading, setDownloading] = useState(false);
  const { showSuccess, showError, clearToast } = useToast();

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
    onError: showError,
    onClearError: clearToast,
  });

  const hasResults = useMemo(() => searchResults.length > 0, [searchResults.length]);

  const hasDuration = Boolean(videoDuration && videoDuration > 0);
  const hasTrimRange = hasDuration && trimEnd > trimStart;
  const isFullRange =
    hasDuration && trimStart <= 0.01 && trimEnd >= (videoDuration ?? 0) - 0.01;
  const shouldTrim = hasTrimRange && !isFullRange;

  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
  }, [trimStart, trimEnd]);

  useEffect(() => {
    isSamplePlayingRef.current = isSamplePlaying;
  }, [isSamplePlaying]);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  const stopMonitor = () => {
    if (monitorRef.current) {
      window.clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  const startMonitor = () => {
    stopMonitor();
    monitorRef.current = window.setInterval(() => {
      if (!playerRef.current) return;
      const current = playerRef.current.getCurrentTime?.() ?? 0;
      setPlayheadTime(current);
      const currentStart = trimStartRef.current;
      const currentEnd = trimEndRef.current;
      if (currentEnd > currentStart && current >= currentEnd) {
        if (loopEnabledRef.current) {
          playerRef.current.seekTo?.(currentStart, true);
          if (isSamplePlayingRef.current) {
            playerRef.current.playVideo?.();
          }
          setPlayheadTime(currentStart);
        } else {
          playerRef.current.pauseVideo?.();
          setIsSamplePlaying(false);
          setPlayheadTime(currentEnd);
          stopMonitor();
        }
      }
    }, 200);
  };

  const canScrub = Boolean(selectedVideoId && isPlayerReady && !previewError);
  const canSamplePlay = Boolean(selectedVideoId && isPlayerReady && hasTrimRange && !previewError);
  const playHint = previewError
    ? previewError
    : !selectedVideoId
      ? undefined
      : !isPlayerReady
        ? 'Loading preview...'
        : !hasTrimRange
          ? 'Select a trim range to enable playback.'
          : undefined;

  useEffect(() => {
    if (videoDuration && videoDuration > 0) {
      setTrimStart(0);
      setTrimEnd(videoDuration);
      setPlayheadTime(0);
    } else {
      setTrimStart(0);
      setTrimEnd(0);
      setPlayheadTime(0);
    }
  }, [videoDuration]);

  useEffect(() => {
    if (!selectedVideoId || !playerContainerRef.current) {
      if (playerRef.current) {
        playerRef.current.destroy?.();
        playerRef.current = null;
      }
      stopMonitor();
      setIsPlayerReady(false);
      setIsSamplePlaying(false);
      setPreviewError(null);
      setPlayheadTime(0);
      return undefined;
    }

    let cancelled = false;
    setPreviewError(null);
    setIsPlayerReady(false);
    setIsSamplePlaying(false);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerContainerRef.current) return;

        if (playerRef.current) {
          playerRef.current.destroy?.();
        }

        playerContainerRef.current.innerHTML = '';
        const playerTarget = document.createElement('div');
        playerTarget.className = 'query-player-iframe';
        playerContainerRef.current.appendChild(playerTarget);

        playerRef.current = new YT.Player(playerTarget, {
          videoId: selectedVideoId,
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setIsPlayerReady(true);
              const duration = playerRef.current?.getDuration?.() ?? 0;
              if (duration > 0) {
                setVideoDuration((prev) => (prev && prev > 0 ? prev : duration));
              }
              playerRef.current?.seekTo?.(trimStart || 0, true);
              playerRef.current?.pauseVideo?.();
              setPlayheadTime(trimStart);
            },
            onStateChange: (event: { data: number }) => {
              if (cancelled) return;
              if (event.data === 1) {
                setIsSamplePlaying(true);
                startMonitor();
              } else if (event.data === 2 || event.data === 0) {
                setIsSamplePlaying(false);
                stopMonitor();
              }
            },
          },
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPreviewError(err.message || 'Preview unavailable');
      });

    return () => {
      cancelled = true;
      stopMonitor();
      if (playerRef.current) {
        playerRef.current.destroy?.();
        playerRef.current = null;
      }
      setIsPlayerReady(false);
      setIsSamplePlaying(false);
    };
  }, [selectedVideoId]);

  useEffect(() => () => stopMonitor(), []);

  const applySelectedResult = (result: YouTubeSearchResult) => {
    const fallbackVideoId = getVideoIdFromUrl(result.url);
    const nextDuration = result.duration ?? null;

    setSelectedResult(result);
    setSelectedVideoId(result.video_id || fallbackVideoId);
    setUrl(result.url);
    setTitle(result.title || '');
    setArtist(result.artist || '');
    setAlbum(result.album || '');
    setVideoDuration(nextDuration);
    setTrimStart(0);
    setTrimEnd(nextDuration ?? 0);
    setPlayheadTime(0);

    clearToast();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = searchQuery.trim();
    if (!normalized) {
      showError('Please enter a search query');
      return;
    }

    setSearching(true);
    clearToast();

    try {
      const results = await mp3Api.searchYouTube(normalized, 20);
      setSearchResults(results);

      if (results.length === 0) {
        setSelectedResult(null);
        setSelectedVideoId('');
        setVideoDuration(null);
        showError('No videos found. Try another search.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'YouTube search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      showError('Please select a YouTube video or enter a URL');
      return;
    }
    if (hasDuration && !hasTrimRange) {
      showError('Trim end must be after start');
      return;
    }

    setDownloading(true);
    if (playerRef.current) {
      playerRef.current.pauseVideo?.();
    }
    stopMonitor();
    setIsSamplePlaying(false);
    clearToast();

    try {
      const request: DownloadRequest = {
        url: url.trim(),
        custom_filename: customFilename.trim() || undefined,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        cover_image_base64: coverImageBase64,
        start_time: shouldTrim ? trimStart : undefined,
        end_time: shouldTrim ? trimEnd : undefined,
      };

      const result = await mp3Api.download(request);
      showSuccess(`Downloaded: ${result.filename}`);

      setUrl('');
      setCustomFilename('');
      setTitle('');
      setArtist('');
      setAlbum('');
      setVideoDuration(null);
      setTrimStart(0);
      setTrimEnd(0);
      resetCoverState();
      setSelectedResult(null);
      setSelectedVideoId('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleToggleSample = () => {
    if (!playerRef.current || !canSamplePlay) return;
    if (isSamplePlaying) {
      playerRef.current.pauseVideo?.();
      setIsSamplePlaying(false);
      stopMonitor();
      return;
    }
    const startTarget = sliderMode === 'playhead' ? playheadTime : trimStart;
    const safeStart = hasTrimRange
      ? Math.min(Math.max(startTarget, trimStart), Math.max(trimStart, trimEnd - 0.05))
      : startTarget;
    playerRef.current.seekTo?.(safeStart || 0, true);
    setPlayheadTime(safeStart);
    playerRef.current.playVideo?.();
    setIsSamplePlaying(true);
    startMonitor();
  };

  const handlePlayheadChange = (value: number) => {
    setPlayheadTime(value);
    if (!playerRef.current || !canScrub) {
      return;
    }
    playerRef.current.seekTo?.(value, true);
    if (isSamplePlayingRef.current) {
      playerRef.current.playVideo?.();
      startMonitor();
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
              previewError ? (
                <div className="query-empty-player">{previewError}</div>
              ) : (
                <div className="query-player-wrap" ref={playerContainerRef}></div>
              )
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
                const nextVideoId = getVideoIdFromUrl(nextUrl);
                setSelectedVideoId(nextVideoId);
                if (!nextVideoId || nextVideoId !== selectedResult?.video_id) {
                  setSelectedResult(null);
                  setVideoDuration(null);
                  setPlayheadTime(0);
                }
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

            <TrimRangeSection
              duration={videoDuration}
              start={trimStart}
              end={trimEnd}
              step={0.1}
              disabled={downloading || !hasDuration}
              playhead={playheadTime}
              isPlaying={isSamplePlaying}
              canPlay={canSamplePlay && !downloading}
              playHint={playHint}
              onTogglePlay={handleToggleSample}
              loopEnabled={loopEnabled}
              onToggleLoop={() => setLoopEnabled((value) => !value)}
              mode={sliderMode}
              onModeChange={setSliderMode}
              canScrub={canScrub}
              onPlayheadChange={handlePlayheadChange}
              onStartChange={setTrimStart}
              onEndChange={setTrimEnd}
            />

            <button type="submit" disabled={downloading} className="btn-primary">
              {downloading ? 'Downloading...' : 'Download MP3'}
            </button>
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
