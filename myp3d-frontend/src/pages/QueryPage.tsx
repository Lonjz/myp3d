import { useState, useEffect, useEffectEvent, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, Download, MonitorPlay, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { mp3Api } from '../api/mp3Api';
import type { YouTubeSearchResult } from '../api/mp3Api';
import { CoverCropModal } from '../components/cover/CoverCropModal';
import { DownloadConfigSection } from '../components/download/DownloadConfigSection';
import { TrimRangeSection } from '../components/download/TrimRangeSection';
import { useToast } from '../components/messages/ToastProvider';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { IconButton } from '../components/ui/IconButton';
import { IconField } from '../components/ui/IconField';
import { Spinner } from '../components/ui/Spinner';
import { useDownloadForm } from '../hooks/useDownloadForm';
import type { DownloadFormValues } from '../hooks/useDownloadForm';
import { readStoredValue, useStoredValueWriter } from '../hooks/usePersistentState';
import { formatDuration } from '../utils/formatters';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { getVideoIdFromUrl } from '../utils/youtube';

type YouTubePlayer = any;

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

const QUERY_DRAFT_KEY = 'query:draft';

interface QueryDraft {
  searchQuery: string;
  selectedResult: YouTubeSearchResult | null;
  selectedVideoId: string;
  videoDuration: number | null;
  trimStart: number;
  trimEnd: number;
  sliderMode: 'range' | 'playhead';
  loopEnabled: boolean;
  form: DownloadFormValues;
}

export function QueryPage() {
  const [initialDraft] = useState(() => readStoredValue<Partial<QueryDraft>>(QUERY_DRAFT_KEY, {}));
  const [searchQuery, setSearchQuery] = useState(initialDraft.searchQuery ?? '');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);

  const [selectedResult, setSelectedResult] = useState<YouTubeSearchResult | null>(initialDraft.selectedResult ?? null);
  const [selectedVideoId, setSelectedVideoId] = useState(initialDraft.selectedVideoId ?? '');

  const [videoDuration, setVideoDuration] = useState<number | null>(initialDraft.videoDuration ?? null);
  const [trimStart, setTrimStart] = useState(initialDraft.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState(initialDraft.trimEnd ?? 0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isSamplePlaying, setIsSamplePlaying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [sliderMode, setSliderMode] = useState<'range' | 'playhead'>(initialDraft.sliderMode ?? 'range');
  const [loopEnabled, setLoopEnabled] = useState(initialDraft.loopEnabled ?? true);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const monitorRef = useRef<number | null>(null);
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  const isSamplePlayingRef = useRef(isSamplePlaying);
  const loopEnabledRef = useRef(loopEnabled);
  const videoDurationRef = useRef(videoDuration);

  const { showError, clearToast } = useToast();

  const {
    url,
    setUrl,
    customFilename,
    setCustomFilename,
    title,
    setTitle,
    artist,
    setArtist,
    album,
    setAlbum,
    loading: downloading,
    coverImageBase64,
    coverPreview,
    handleCoverFileSelect,
    handleRemoveCover,
    cropModalProps,
    overwriteDialogProps,
    submitDownload,
  } = useDownloadForm({
    zoomInputId: 'queryCropZoom',
    initialValues: initialDraft.form,
    onDownloaded: () => {
      resetTiming(null);
      setSelectedResult(null);
      setSelectedVideoId('');
    },
  });

  const draft = useMemo<QueryDraft>(
    () => ({
      searchQuery,
      selectedResult,
      selectedVideoId,
      videoDuration,
      trimStart,
      trimEnd,
      sliderMode,
      loopEnabled,
      form: { url, customFilename, title, artist, album, cover: coverImageBase64 },
    }),
    [
      searchQuery,
      selectedResult,
      selectedVideoId,
      videoDuration,
      trimStart,
      trimEnd,
      sliderMode,
      loopEnabled,
      url,
      customFilename,
      title,
      artist,
      album,
      coverImageBase64,
    ],
  );

  useStoredValueWriter(QUERY_DRAFT_KEY, draft);

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

  useEffect(() => {
    videoDurationRef.current = videoDuration;
  }, [videoDuration]);

  const resetTiming = (duration: number | null) => {
    setVideoDuration(duration);
    setTrimStart(0);
    setTrimEnd(duration && duration > 0 ? duration : 0);
    setPlayheadTime(0);
  };

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
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setIsPlayerReady(true);
              const duration = playerRef.current?.getDuration?.() ?? 0;
              const knownDuration = videoDurationRef.current;
              if (duration > 0 && !(knownDuration && knownDuration > 0)) {
                resetTiming(duration);
              }
              playerRef.current?.seekTo?.(trimStart || 0, true);
              playerRef.current?.pauseVideo?.();
              setPlayheadTime(trimStart);
            },
            onStateChange: (event: { data: number }) => {
              if (cancelled) return;
              if (event.data === 1) {
                emitAppEvent('preview-play');
                setIsSamplePlaying(true);
                startMonitor();
              } else if (event.data === 2 || event.data === 0) {
                setIsSamplePlaying(false);
                stopMonitor();
              }
            },
            onError: () => {
              if (cancelled) return;
              setPreviewError('This video cannot be embedded for preview.');
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

  useEffect(() => subscribeAppEvent('player-play', () => playerRef.current?.pauseVideo?.()), []);

  const applySelectedResult = (result: YouTubeSearchResult) => {
    const fallbackVideoId = getVideoIdFromUrl(result.url);
    const nextDuration = result.duration ?? null;

    setSelectedResult(result);
    setSelectedVideoId(result.video_id || fallbackVideoId);
    setUrl(result.url);
    setTitle(result.title || '');
    setArtist(result.artist || '');
    setAlbum(result.album || '');
    resetTiming(nextDuration);

    clearToast();
  };

  const runSearch = async (query: string) => {
    const normalized = query.trim();
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
        resetTiming(null);
        showError('No videos found. Try another search.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'YouTube search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(searchQuery);
  };

  const applyUrl = (nextUrl: string) => {
    setUrl(nextUrl);
    const nextVideoId = getVideoIdFromUrl(nextUrl);
    setSelectedVideoId(nextVideoId);
    if (!nextVideoId || nextVideoId !== selectedResult?.video_id) {
      setSelectedResult(null);
      resetTiming(null);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();

  const applySearchParams = useEffectEvent((params: URLSearchParams) => {
    const incomingUrl = params.get('url');
    const incomingQuery = params.get('q');
    if (!incomingUrl && !incomingQuery) return;

    if (incomingUrl) {
      applyUrl(incomingUrl);
    }
    if (incomingQuery) {
      setSearchQuery(incomingQuery);
      void runSearch(incomingQuery);
    }
    setSearchParams({}, { replace: true });
  });

  useEffect(() => {
    applySearchParams(searchParams);
  }, [searchParams]);

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

    if (playerRef.current) {
      playerRef.current.pauseVideo?.();
    }
    stopMonitor();
    setIsSamplePlaying(false);

    await submitDownload({
      start_time: shouldTrim ? trimStart : undefined,
      end_time: shouldTrim ? trimEnd : undefined,
    });
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
      <div className="query-layout">
        <aside className="query-sidebar glass">
          <form onSubmit={handleSearch} className="query-search-form">
            <IconField
              icon={Search}
              label="Search YouTube"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={searching}
            />
            {searching ? (
              <span className="query-search-spinner"><Spinner inline /></span>
            ) : (
              <IconButton icon={ArrowRight} label="Search" variant="primary" type="submit" />
            )}
          </form>


          <div className="query-results-list">
            {searchResults.map((result, index) => {
              const isActive = selectedResult?.video_id === result.video_id;
              return (
                <button
                  key={`${result.video_id}-${result.url}`}
                  type="button"
                  className={`query-result-item ${isActive ? 'active' : ''}`}
                  style={{ '--row': index } as CSSProperties}
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
          <div className="query-preview-card glass">
            {selectedVideoId ? (
              previewError ? (
                <div className="query-empty-player">{previewError}</div>
              ) : (
                <div className="query-player-outer">
                  <div className="query-player-wrap" ref={playerContainerRef}></div>
                  {!isSamplePlaying && (
                    <img
                      className="query-player-thumb-overlay"
                      src={
                        selectedResult?.thumbnail_url ||
                        `https://i.ytimg.com/vi/${selectedVideoId}/hqdefault.jpg`
                      }
                      alt=""
                    />
                  )}
                </div>
              )
            ) : (
              <div className="query-empty-player" aria-label="No preview">
                <MonitorPlay aria-hidden="true" />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="download-form glass">
            <DownloadConfigSection
              idPrefix="query"
              url={url}
              onUrlChange={applyUrl}
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
              action={(
                <button type="submit" disabled={downloading} className="btn-primary">
                  {downloading ? <Spinner inline /> : <Download aria-hidden="true" />}
                  Download
                </button>
              )}
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
          </form>
        </section>
      </div>

      <CoverCropModal {...cropModalProps} />
      <ConfirmDialog {...overwriteDialogProps} />
    </div>
  );
}
