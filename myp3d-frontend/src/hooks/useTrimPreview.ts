import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import { useToast } from '../components/messages/toastContext';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { errorMessage } from '../utils/formatters';
import { loadYouTubeApi } from '../utils/youtube';
import type { YouTubePlayer } from '../utils/youtube';

const EDGE_SECONDS = 3;

export type TrimMode = 'range' | 'playhead';

export interface TrimTiming {
  duration: number | null;
  start: number;
  end: number;
  mode: TrimMode;
  loop: boolean;
}

export function useTrimPreview(videoId: string, initial: Partial<TrimTiming> = {}) {
  const [duration, setDuration] = useState<number | null>(initial.duration ?? null);
  const [start, setStart] = useState(initial.start ?? 0);
  const [end, setEnd] = useState(initial.end ?? 0);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failure, setFailure] = useState<{ videoId: string; message: string } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [mode, setMode] = useState<TrimMode>(initial.mode ?? 'range');
  const [loop, setLoop] = useState(initial.loop ?? true);
  const [smartTrimming, setSmartTrimming] = useState(false);
  const { showError } = useToast();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const monitorRef = useRef<number | null>(null);
  const startRef = useRef(start);
  const endRef = useRef(end);
  const isPlayingRef = useRef(isPlaying);
  const loopRef = useRef(loop);
  const edgeRef = useRef<'head' | 'tail' | null>(null);
  const videoIdRef = useRef(videoId);

  const previewError = failure?.videoId === videoId ? failure.message : null;
  const hasDuration = Boolean(duration && duration > 0);
  const hasTrimRange = hasDuration && end > start;
  const isFullRange = hasDuration && start <= 0.01 && end >= (duration ?? 0) - 0.01;
  const shouldTrim = hasTrimRange && !isFullRange;

  useEffect(() => {
    startRef.current = start;
    endRef.current = end;
    isPlayingRef.current = isPlaying;
    loopRef.current = loop;
    videoIdRef.current = videoId;
  }, [start, end, isPlaying, loop, videoId]);

  const reset = (nextDuration: number | null) => {
    setDuration(nextDuration);
    setStart(0);
    setEnd(nextDuration && nextDuration > 0 ? nextDuration : 0);
    setPlayhead(0);
  };

  const stopMonitor = () => {
    if (monitorRef.current) {
      window.clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  const destroyPlayer = () => {
    playerRef.current?.destroy?.();
    playerRef.current = null;
  };

  const stopAt = (seconds: number) => {
    playerRef.current?.pauseVideo?.();
    setIsPlaying(false);
    setPlayhead(seconds);
    stopMonitor();
  };

  const startMonitor = () => {
    stopMonitor();
    monitorRef.current = window.setInterval(() => {
      if (!playerRef.current) return;
      const current = playerRef.current.getCurrentTime?.() ?? 0;
      setPlayhead(current);
      const currentStart = startRef.current;
      const currentEnd = endRef.current;
      if (edgeRef.current === 'head' && current >= currentStart + EDGE_SECONDS) {
        edgeRef.current = 'tail';
        playerRef.current.seekTo?.(currentEnd - EDGE_SECONDS, true);
        setPlayhead(currentEnd - EDGE_SECONDS);
        return;
      }
      if (edgeRef.current === 'tail' && current >= currentEnd) {
        edgeRef.current = null;
        stopAt(currentEnd);
        return;
      }
      if (currentEnd > currentStart && current >= currentEnd) {
        if (loopRef.current) {
          playerRef.current.seekTo?.(currentStart, true);
          if (isPlayingRef.current) {
            playerRef.current.playVideo?.();
          }
          setPlayhead(currentStart);
        } else {
          stopAt(currentEnd);
        }
      }
    }, 200);
  };

  const playFrom = (seconds: number) => {
    playerRef.current?.seekTo?.(seconds, true);
    setPlayhead(seconds);
    playerRef.current?.playVideo?.();
    setIsPlaying(true);
    startMonitor();
  };

  const pause = () => {
    edgeRef.current = null;
    playerRef.current?.pauseVideo?.();
    stopMonitor();
    setIsPlaying(false);
  };

  const canScrub = Boolean(videoId && isReady && !previewError);
  const canPlay = Boolean(videoId && isReady && hasTrimRange && !previewError);
  const playHint = previewError
    ? previewError
    : !videoId
      ? undefined
      : !isReady
        ? 'Loading preview...'
        : !hasTrimRange
          ? 'Select a trim range to enable playback.'
          : undefined;

  const handlePlayerReady = useEffectEvent(() => {
    setIsReady(true);
    const playerDuration = playerRef.current?.getDuration?.() ?? 0;
    if (playerDuration > 0 && !hasDuration) {
      setDuration(playerDuration);
      if (endRef.current <= 0) setEnd(playerDuration);
    }
    playerRef.current?.seekTo?.(start || 0, true);
    playerRef.current?.pauseVideo?.();
    setPlayhead(start);
  });

  const handlePlayerStateChange = useEffectEvent((state: number) => {
    if (state === 1) {
      emitAppEvent('preview-play');
      setIsPlaying(true);
      startMonitor();
    } else if (state === 2 || state === 0) {
      setIsPlaying(false);
      stopMonitor();
    }
  });

  useEffect(() => {
    if (!videoId || !containerRef.current) {
      destroyPlayer();
      stopMonitor();
      return undefined;
    }

    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;

        destroyPlayer();
        containerRef.current.innerHTML = '';
        const playerTarget = document.createElement('div');
        playerTarget.className = 'query-player-iframe';
        containerRef.current.appendChild(playerTarget);

        playerRef.current = new YT.Player(playerTarget, {
          videoId,
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
              if (!cancelled) handlePlayerReady();
            },
            onStateChange: (event: { data: number }) => {
              if (!cancelled) handlePlayerStateChange(event.data);
            },
            onError: () => {
              if (cancelled) return;
              setFailure({ videoId, message: 'This video cannot be embedded for preview.' });
            },
          },
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setFailure({ videoId, message: err.message || 'Preview unavailable' });
      });

    return () => {
      cancelled = true;
      stopMonitor();
      destroyPlayer();
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [videoId]);

  useEffect(() => subscribeAppEvent('player-play', () => playerRef.current?.pauseVideo?.()), []);

  const togglePlay = () => {
    if (!playerRef.current || !canPlay) return;
    if (isPlaying) {
      pause();
      return;
    }
    edgeRef.current = null;
    const startTarget = mode === 'playhead' ? playhead : start;
    playFrom(Math.min(Math.max(startTarget, start), Math.max(start, end - 0.05)));
  };

  const changePlayhead = (value: number) => {
    edgeRef.current = null;
    setPlayhead(value);
    if (!playerRef.current || !canScrub) {
      return;
    }
    playerRef.current.seekTo?.(value, true);
    if (isPlayingRef.current) {
      playerRef.current.playVideo?.();
      startMonitor();
    }
  };

  const playEdges = () => {
    if (!playerRef.current || !canPlay) return;
    edgeRef.current = end - start > EDGE_SECONDS * 2 ? 'head' : 'tail';
    playFrom(start);
  };

  const smartTrim = async () => {
    if (!videoId) return;
    const requested = videoId;
    pause();
    setSmartTrimming(true);
    try {
      const range = await mp3Api.silenceBounds(`https://www.youtube.com/watch?v=${requested}`);
      if (requested !== videoIdRef.current) return;
      const total = hasDuration && duration ? duration : range.duration;
      const nextEnd = Math.min(range.end, total);
      setDuration(total);
      setStart(range.start);
      setEnd(nextEnd);
    } catch (err) {
      showError(errorMessage(err, "Couldn't find the silence"));
    } finally {
      setSmartTrimming(false);
    }
  };

  return {
    containerRef,
    duration,
    start,
    end,
    mode,
    loop,
    isPlaying,
    previewError,
    hasDuration,
    hasTrimRange,
    shouldTrim,
    reset,
    pause,
    trimRangeProps: {
      duration,
      start,
      end,
      step: 0.1,
      playhead,
      isPlaying,
      canPlay,
      playHint,
      onTogglePlay: togglePlay,
      loopEnabled: loop,
      onToggleLoop: () => setLoop((value) => !value),
      mode,
      onModeChange: setMode,
      canScrub,
      onPlayheadChange: changePlayhead,
      onStartChange: setStart,
      onEndChange: setEnd,
      onSmartTrim: videoId ? () => void smartTrim() : undefined,
      smartTrimming,
      onPlayEdges: playEdges,
    },
  };
}
