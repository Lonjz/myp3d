import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { mp3Api } from '../api/mp3Api';
import type { TrimRange } from '../api/mp3Api';
import { useToast } from '../components/messages/toastContext';
import { emitAppEvent, subscribeAppEvent } from '../utils/appEvents';
import { errorMessage } from '../utils/formatters';
import { loadYouTubeApi } from '../utils/youtube';
import type { YouTubePlayer } from '../utils/youtube';

const EDGE_SECONDS = 3;
const SAME_LENGTH_S = 0.05;

export type TrimMode = 'range' | 'playhead';

export type TrimSource = { kind: 'youtube'; videoId: string } | { kind: 'track'; filename: string };

export interface TrimTiming {
  duration: number | null;
  start: number;
  end: number;
  mode: TrimMode;
  loop: boolean;
}

interface TrimPlayer {
  currentTime: () => number;
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  destroy: () => void;
}

interface PlayerEvents {
  ready: (length: number) => void;
  playing: (on: boolean) => void;
  failed: (message: string) => void;
}

function createAudioPlayer(url: string, events: PlayerEvents): TrimPlayer {
  const audio = new Audio(url);
  audio.preload = 'auto';
  const listeners: Array<[string, () => void]> = [
    ['loadedmetadata', () => events.ready(Number.isFinite(audio.duration) ? audio.duration : 0)],
    ['playing', () => events.playing(true)],
    ['pause', () => events.playing(false)],
    ['ended', () => events.playing(false)],
    ['error', () => events.failed("Couldn't load the song")],
  ];
  listeners.forEach(([name, listener]) => audio.addEventListener(name, listener));
  return {
    currentTime: () => audio.currentTime,
    seek: (seconds) => {
      audio.currentTime = seconds;
    },
    play: () => {
      audio.play().catch(() => events.playing(false));
    },
    pause: () => audio.pause(),
    destroy: () => {
      listeners.forEach(([name, listener]) => audio.removeEventListener(name, listener));
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}

function createYouTubePlayer(
  api: Awaited<ReturnType<typeof loadYouTubeApi>>,
  container: HTMLElement,
  videoId: string,
  events: PlayerEvents,
): TrimPlayer {
  container.innerHTML = '';
  const target = document.createElement('div');
  target.className = 'query-player-iframe';
  container.appendChild(target);

  const player: YouTubePlayer = new api.Player(target, {
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
      onReady: () => events.ready(player.getDuration?.() ?? 0),
      onStateChange: ({ data }) => {
        if (data === 1) events.playing(true);
        else if (data === 2 || data === 0) events.playing(false);
      },
      onError: () => events.failed('This video cannot be embedded for preview.'),
    },
  });

  return {
    currentTime: () => player.getCurrentTime?.() ?? 0,
    seek: (seconds) => player.seekTo?.(seconds, true),
    play: () => player.playVideo?.(),
    pause: () => player.pauseVideo?.(),
    destroy: () => player.destroy?.(),
  };
}

export function useTrimPreview(source: TrimSource, initial: Partial<TrimTiming> = {}) {
  const sourceKey = source.kind === 'youtube' ? source.videoId : source.filename;
  const isTrack = source.kind === 'track';

  const [duration, setDuration] = useState<number | null>(initial.duration ?? null);
  const [start, setStart] = useState(initial.start ?? 0);
  const [end, setEnd] = useState(initial.end ?? 0);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [mode, setMode] = useState<TrimMode>(initial.mode ?? 'range');
  const [loop, setLoop] = useState(initial.loop ?? true);
  const [smartTrimming, setSmartTrimming] = useState(false);
  const [attachKey, setAttachKey] = useState(0);
  const { showError } = useToast();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<TrimPlayer | null>(null);
  const monitorRef = useRef<number | null>(null);
  const startRef = useRef(start);
  const endRef = useRef(end);
  const isPlayingRef = useRef(isPlaying);
  const loopRef = useRef(loop);
  const edgeRef = useRef<'head' | 'tail' | null>(null);
  const sourceKeyRef = useRef(sourceKey);
  const readyKeyRef = useRef<string | null>(null);

  const previewError = failure?.key === sourceKey ? failure.message : null;
  const hasDuration = Boolean(duration && duration > 0);
  const hasTrimRange = hasDuration && end > start;
  const isFullRange = hasDuration && start <= 0.01 && end >= (duration ?? 0) - 0.01;
  const shouldTrim = hasTrimRange && !isFullRange;

  useEffect(() => {
    startRef.current = start;
    endRef.current = end;
    isPlayingRef.current = isPlaying;
    loopRef.current = loop;
    sourceKeyRef.current = sourceKey;
  }, [start, end, isPlaying, loop, sourceKey]);

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
    playerRef.current?.destroy();
    playerRef.current = null;
  };

  const stopAt = (seconds: number) => {
    playerRef.current?.pause();
    setIsPlaying(false);
    setPlayhead(seconds);
    stopMonitor();
  };

  const startMonitor = () => {
    stopMonitor();
    monitorRef.current = window.setInterval(() => {
      if (!playerRef.current) return;
      const current = playerRef.current.currentTime();
      setPlayhead(current);
      const currentStart = startRef.current;
      const currentEnd = endRef.current;
      if (edgeRef.current === 'head' && current >= currentStart + EDGE_SECONDS) {
        edgeRef.current = 'tail';
        playerRef.current.seek(currentEnd - EDGE_SECONDS);
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
          playerRef.current.seek(currentStart);
          if (isPlayingRef.current) {
            playerRef.current.play();
          }
          setPlayhead(currentStart);
        } else {
          stopAt(currentEnd);
        }
      }
    }, 200);
  };

  const playFrom = (seconds: number) => {
    playerRef.current?.seek(seconds);
    setPlayhead(seconds);
    playerRef.current?.play();
    setIsPlaying(true);
    startMonitor();
  };

  const pause = () => {
    edgeRef.current = null;
    playerRef.current?.pause();
    stopMonitor();
    setIsPlaying(false);
  };

  const canScrub = Boolean(sourceKey && isReady && !previewError);
  const canPlay = Boolean(sourceKey && isReady && hasTrimRange && !previewError);
  const playHint = previewError
    ? previewError
    : !sourceKey
      ? undefined
      : !isReady
        ? 'Loading preview...'
        : !hasTrimRange
          ? 'Select a trim range to enable playback.'
          : undefined;

  const handlePlayerReady = useEffectEvent((length: number) => {
    setIsReady(true);
    if (isTrack) {
      const sameFile = readyKeyRef.current === sourceKey && hasDuration && Math.abs((duration ?? 0) - length) < SAME_LENGTH_S;
      readyKeyRef.current = sourceKey;
      if (!sameFile && length > 0) reset(length);
      return;
    }
    if (length > 0 && !hasDuration) {
      setDuration(length);
      if (endRef.current <= 0) setEnd(length);
    }
    playerRef.current?.seek(start || 0);
    playerRef.current?.pause();
    setPlayhead(start);
  });

  const handlePlayingChange = useEffectEvent((on: boolean) => {
    setIsPlaying(on);
    if (on) {
      emitAppEvent('preview-play');
      startMonitor();
    } else {
      stopMonitor();
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!sourceKey || (!isTrack && !container)) {
      destroyPlayer();
      stopMonitor();
      return undefined;
    }

    let cancelled = false;
    const events: PlayerEvents = {
      ready: (length) => {
        if (!cancelled) handlePlayerReady(length);
      },
      playing: (on) => {
        if (!cancelled) handlePlayingChange(on);
      },
      failed: (message) => {
        if (!cancelled) setFailure({ key: sourceKey, message });
      },
    };

    if (isTrack) {
      playerRef.current = createAudioPlayer(mp3Api.getFileUrl(sourceKey), events);
    } else {
      loadYouTubeApi()
        .then((api) => {
          if (cancelled || !container) return;
          destroyPlayer();
          playerRef.current = createYouTubePlayer(api, container, sourceKey, events);
        })
        .catch((err: Error) => {
          if (!cancelled) setFailure({ key: sourceKey, message: err.message || 'Preview unavailable' });
        });
    }

    return () => {
      cancelled = true;
      stopMonitor();
      destroyPlayer();
      setIsReady(false);
      setIsPlaying(false);
    };
  }, [sourceKey, isTrack, attachKey]);

  useEffect(() => subscribeAppEvent('player-play', () => playerRef.current?.pause()), []);

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
    playerRef.current.seek(value);
    if (isPlayingRef.current) {
      playerRef.current.play();
      startMonitor();
    }
  };

  const playEdges = () => {
    if (!playerRef.current || !canPlay) return;
    edgeRef.current = end - start > EDGE_SECONDS * 2 ? 'head' : 'tail';
    playFrom(start);
  };

  const findSilence = (key: string): Promise<TrimRange> =>
    isTrack ? mp3Api.trackSilence(key) : mp3Api.silenceBounds(`https://www.youtube.com/watch?v=${key}`);

  const smartTrim = async () => {
    if (!sourceKey) return;
    const requested = sourceKey;
    pause();
    setSmartTrimming(true);
    try {
      const range = await findSilence(requested);
      if (requested !== sourceKeyRef.current) return;
      const total = hasDuration && duration ? duration : range.duration;
      setDuration(total);
      setStart(range.start);
      setEnd(Math.min(range.end, total));
    } catch (err) {
      showError(errorMessage(err, "Couldn't find the silence"));
    } finally {
      setSmartTrimming(false);
    }
  };

  const release = () => {
    pause();
    destroyPlayer();
    setIsReady(false);
  };

  const reload = () => setAttachKey((key) => key + 1);

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
    release,
    reload,
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
      onSmartTrim: sourceKey ? () => void smartTrim() : undefined,
      smartTrimming,
      onPlayEdges: playEdges,
    },
  };
}
