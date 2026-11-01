import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';

interface YouTubePlayer {
  destroy?: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
}

interface YouTubePlayerOptions {
  videoId: string;
  height: string;
  width: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: () => void;
    onStateChange: (event: { data: number }) => void;
    onError: () => void;
  };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

const loadYouTubeApi = (() => {
  let promise: Promise<YouTubeApi> | null = null;

  return () => {
    const youtubeWindow = window as YouTubeWindow;
    const existing = youtubeWindow.YT;
    if (existing && existing.Player) {
      return Promise.resolve(existing);
    }

    if (promise) {
      return promise;
    }

    promise = new Promise<YouTubeApi>((resolve, reject) => {
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

      const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
      youtubeWindow.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        const ready = youtubeWindow.YT;
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const monitorRef = useRef<number | null>(null);
  const startRef = useRef(start);
  const endRef = useRef(end);
  const isPlayingRef = useRef(isPlaying);
  const loopRef = useRef(loop);

  const previewError = failure?.videoId === videoId ? failure.message : null;
  const hasDuration = Boolean(duration && duration > 0);
  const hasTrimRange = hasDuration && end > start;
  const isFullRange = hasDuration && start <= 0.01 && end >= (duration ?? 0) - 0.01;
  const shouldTrim = hasTrimRange && !isFullRange;

  useEffect(() => {
    startRef.current = start;
    endRef.current = end;
  }, [start, end]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

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

  const startMonitor = () => {
    stopMonitor();
    monitorRef.current = window.setInterval(() => {
      if (!playerRef.current) return;
      const current = playerRef.current.getCurrentTime?.() ?? 0;
      setPlayhead(current);
      const currentStart = startRef.current;
      const currentEnd = endRef.current;
      if (currentEnd > currentStart && current >= currentEnd) {
        if (loopRef.current) {
          playerRef.current.seekTo?.(currentStart, true);
          if (isPlayingRef.current) {
            playerRef.current.playVideo?.();
          }
          setPlayhead(currentStart);
        } else {
          playerRef.current.pauseVideo?.();
          setIsPlaying(false);
          setPlayhead(currentEnd);
          stopMonitor();
        }
      }
    }, 200);
  };

  const pause = () => {
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
      if (playerRef.current) {
        playerRef.current.destroy?.();
        playerRef.current = null;
      }
      stopMonitor();
      return undefined;
    }

    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;

        if (playerRef.current) {
          playerRef.current.destroy?.();
        }

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
      if (playerRef.current) {
        playerRef.current.destroy?.();
        playerRef.current = null;
      }
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [videoId]);

  useEffect(() => () => stopMonitor(), []);

  useEffect(() => subscribeAppEvent('player-play', () => playerRef.current?.pauseVideo?.()), []);

  const togglePlay = () => {
    if (!playerRef.current || !canPlay) return;
    if (isPlaying) {
      pause();
      return;
    }
    const startTarget = mode === 'playhead' ? playhead : start;
    const safeStart = Math.min(Math.max(startTarget, start), Math.max(start, end - 0.05));
    playerRef.current.seekTo?.(safeStart || 0, true);
    setPlayhead(safeStart);
    playerRef.current.playVideo?.();
    setIsPlaying(true);
    startMonitor();
  };

  const changePlayhead = (value: number) => {
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
    },
  };
}
