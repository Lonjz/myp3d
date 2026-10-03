import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { mp3Api } from '../../api/mp3Api';
import type { MP3Info } from '../../api/mp3Api';
import { readStoredValue, useStoredValueWriter, writeStoredValue } from '../../hooks/usePersistentState';
import { emitAppEvent, subscribeAppEvent } from '../../utils/appEvents';
import type { PlayRequest } from '../../utils/appEvents';
import { useToast } from '../messages/ToastProvider';
import { PlayerContext, PlayerTimeContext } from './playerContext';
import type { PlayerContextValue, PlayerTimeValue, PlayOptions } from './playerContext';
import { playerReducer, restorePlayerState } from './playerReducer';
import type { PersistedPlayerState } from './playerReducer';

const STATE_KEY = 'player';
const POSITION_KEY = 'player:position';
const POSITION_SAVE_INTERVAL_MS = 5000;
const RESTART_THRESHOLD_SECONDS = 3;
const SEEK_STEP_SECONDS = 10;

interface SavedPosition {
  filename: string;
  time: number;
}

const randomSeed = () => Math.floor(Math.random() * 4294967296);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('button, [role="slider"], [role="option"], [role="dialog"], [role="alertdialog"]')) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { showError } = useToast();
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    restorePlayerState(readStoredValue<Partial<PersistedPlayerState> | null>(STATE_KEY, null)),
  );
  const [initialPosition] = useState(() => {
    const saved = readStoredValue<SavedPosition | null>(POSITION_KEY, null);
    const filename = state.queue[state.index]?.filename;
    return saved && saved.filename === filename && saved.time > 0 ? saved.time : 0;
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingSeekRef = useRef<number | null>(initialPosition > 0 ? initialPosition : null);
  const switchingRef = useRef(false);
  const errorCountRef = useRef(0);
  const lastPositionSaveRef = useRef(0);
  const lastPositionStateRef = useRef(0);

  const currentTrack = state.queue[state.index] ?? null;
  const currentFilename = currentTrack?.filename ?? null;

  const [time, setTime] = useState<PlayerTimeValue>(() => ({
    currentTime: initialPosition,
    duration: currentTrack?.duration ?? 0,
  }));
  const [timeFilename, setTimeFilename] = useState(currentFilename);

  if (timeFilename !== currentFilename) {
    setTimeFilename(currentFilename);
    setTime({ currentTime: 0, duration: currentTrack?.duration ?? 0 });
  }

  const persisted = useMemo<PersistedPlayerState>(
    () => ({
      queue: state.queue,
      originalQueue: state.originalQueue,
      index: state.index,
      shuffle: state.shuffle,
      repeat: state.repeat,
      volume: state.volume,
      muted: state.muted,
    }),
    [state.queue, state.originalQueue, state.index, state.shuffle, state.repeat, state.volume, state.muted],
  );

  useStoredValueWriter(STATE_KEY, persisted);

  const savePosition = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentFilename) return;
    writeStoredValue(POSITION_KEY, { filename: currentFilename, time: audio.currentTime });
  }, [currentFilename]);

  useEffect(() => {
    window.addEventListener('pagehide', savePosition);
    return () => window.removeEventListener('pagehide', savePosition);
  }, [savePosition]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentFilename) {
      switchingRef.current = false;
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const url = mp3Api.getFileUrl(currentFilename);
    if (audio.src !== url) {
      switchingRef.current = true;
      audio.src = url;
    }
  }, [currentFilename]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentFilename) return;
    if (state.isPlaying) {
      audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        dispatch({ type: 'setPlaying', playing: false });
      });
    } else {
      audio.pause();
    }
  }, [state.isPlaying, currentFilename]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.muted;
  }, [state.volume, state.muted]);

  const seek = useCallback((target: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const clamped = Math.min(Math.max(0, target), duration);
    if (audio.readyState === 0) {
      pendingSeekRef.current = clamped;
    } else {
      audio.currentTime = clamped;
    }
    setTime((previous) => ({ ...previous, currentTime: clamped }));
  }, []);

  const playTracks = useCallback((tracks: MP3Info[], startIndex?: number, options?: PlayOptions) => {
    if (tracks.length === 0) return;
    const index = startIndex ?? (options?.shuffle ? Math.floor(Math.random() * tracks.length) : 0);
    pendingSeekRef.current = null;
    dispatch({ type: 'playTracks', tracks, startIndex: index, shuffle: options?.shuffle, seed: randomSeed() });
    const audio = audioRef.current;
    if (audio && tracks[index] && audio.src === mp3Api.getFileUrl(tracks[index].filename)) {
      audio.currentTime = 0;
    }
  }, []);

  const playAlbum = useCallback(
    async (albumKey: string, options?: PlayOptions) => {
      try {
        const detail = await mp3Api.getAlbum(albumKey);
        playTracks(detail.tracks, options?.shuffle ? undefined : 0, options);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load album');
      }
    },
    [playTracks, showError],
  );

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      seek(0);
      return;
    }
    if (state.index <= 0 && state.repeat !== 'all') {
      seek(0);
      return;
    }
    dispatch({ type: 'prev' });
  }, [seek, state.index, state.repeat]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      state,
      currentTrack,
      playTracks,
      playAlbum,
      playNext: (track) => dispatch({ type: 'playNext', track }),
      enqueue: (tracks) => dispatch({ type: 'enqueue', tracks }),
      togglePlay: () => dispatch({ type: 'setPlaying', playing: !state.isPlaying }),
      play: () => dispatch({ type: 'setPlaying', playing: true }),
      pause: () => dispatch({ type: 'setPlaying', playing: false }),
      next: () => dispatch({ type: 'next' }),
      previous,
      seek,
      jumpTo: (index) => dispatch({ type: 'jumpTo', index }),
      remove: (index) => dispatch({ type: 'remove', index }),
      clear: () => dispatch({ type: 'clear' }),
      toggleShuffle: () => dispatch({ type: 'toggleShuffle', seed: randomSeed() }),
      cycleRepeat: () => dispatch({ type: 'cycleRepeat' }),
      setVolume: (volume) => dispatch({ type: 'setVolume', volume }),
      toggleMute: () => dispatch({ type: 'toggleMute' }),
      trackUpdated: (oldFilename, track) => {
        if (oldFilename === currentFilename && oldFilename !== track.filename && audioRef.current) {
          pendingSeekRef.current = audioRef.current.currentTime;
        }
        dispatch({ type: 'trackUpdated', oldFilename, track });
      },
      isCurrent: (filename) => filename === currentFilename,
    }),
    [state, currentTrack, currentFilename, playTracks, playAlbum, previous, seek],
  );

  const onPlayRequest = useEffectEvent((request: PlayRequest) => {
    if ('albumKey' in request) {
      void playAlbum(request.albumKey, { shuffle: request.shuffle });
    } else {
      playTracks(request.tracks, request.startIndex, { shuffle: request.shuffle });
    }
  });

  const onLibraryChanged = useEffectEvent(() => {
    if (state.queue.length === 0) return;
    mp3Api
      .listAll()
      .then((tracks) => dispatch({ type: 'syncLibrary', tracks }))
      .catch(() => undefined);
  });

  useEffect(() => {
    const unsubscribers = [
      subscribeAppEvent('play-request', (request) => onPlayRequest(request)),
      subscribeAppEvent('preview-play', () => dispatch({ type: 'setPlaying', playing: false })),
      subscribeAppEvent('library-changed', () => onLibraryChanged()),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const onGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (state.queue.length === 0 || isTypingTarget(event.target)) return;
    event.preventDefault();
    dispatch({ type: 'setPlaying', playing: !state.isPlaying });
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => onGlobalKeyDown(event);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const onMediaAction = useEffectEvent((details: MediaSessionActionDetails) => {
    const audio = audioRef.current;
    switch (details.action) {
      case 'play':
        dispatch({ type: 'setPlaying', playing: true });
        break;
      case 'pause':
        dispatch({ type: 'setPlaying', playing: false });
        break;
      case 'previoustrack':
        previous();
        break;
      case 'nexttrack':
        dispatch({ type: 'next' });
        break;
      case 'seekto':
        if (details.seekTime !== undefined) seek(details.seekTime);
        break;
      case 'seekbackward':
        if (audio) seek(audio.currentTime - (details.seekOffset ?? SEEK_STEP_SECONDS));
        break;
      case 'seekforward':
        if (audio) seek(audio.currentTime + (details.seekOffset ?? SEEK_STEP_SECONDS));
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const actions: MediaSessionAction[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'];
    actions.forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, (details) => onMediaAction(details));
      } catch {
        return;
      }
    });
    return () => {
      actions.forEach((action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          return;
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || currentTrack.filename,
      artist: currentTrack.artist ?? '',
      album: currentTrack.album ?? '',
      artwork: currentTrack.has_cover
        ? [{ src: mp3Api.getCoverUrl(currentTrack.filename, 'full'), sizes: '500x500', type: 'image/webp' }]
        : [],
    });
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = currentTrack ? (state.isPlaying ? 'playing' : 'paused') : 'none';
  }, [currentTrack, state.isPlaying]);

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    switchingRef.current = false;
    if (pendingSeekRef.current !== null) {
      audio.currentTime = Math.min(pendingSeekRef.current, audio.duration || pendingSeekRef.current);
      pendingSeekRef.current = null;
    }
    setTime({ currentTime: audio.currentTime, duration: audio.duration || currentTrack?.duration || 0 });
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || switchingRef.current) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : currentTrack?.duration || 0;
    setTime({ currentTime: audio.currentTime, duration });

    const now = Date.now();
    if (state.isPlaying && now - lastPositionSaveRef.current > POSITION_SAVE_INTERVAL_MS) {
      lastPositionSaveRef.current = now;
      savePosition();
    }
    if ('mediaSession' in navigator && duration > 0 && now - lastPositionStateRef.current > 1000) {
      lastPositionStateRef.current = now;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(audio.currentTime, duration),
          playbackRate: audio.playbackRate,
        });
      } catch {
        return;
      }
    }
  };

  const handleEnded = () => {
    const audio = audioRef.current;
    if (audio && state.repeat === 'one') {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    dispatch({ type: 'ended' });
  };

  const handlePlay = () => {
    errorCountRef.current = 0;
    emitAppEvent('player-play');
    dispatch({ type: 'setPlaying', playing: true });
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio || audio.ended || switchingRef.current) return;
    savePosition();
    dispatch({ type: 'setPlaying', playing: false });
  };

  const handleError = () => {
    const audio = audioRef.current;
    if (!audio?.getAttribute('src') || !currentTrack) return;
    switchingRef.current = false;
    errorCountRef.current += 1;
    showError(`Couldn't play ${currentTrack.title || currentTrack.filename}`);
    if (errorCountRef.current >= state.queue.length) {
      dispatch({ type: 'setPlaying', playing: false });
      return;
    }
    dispatch({ type: 'ended' });
  };

  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={time}>
        {children}
        <audio
          ref={audioRef}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          onError={handleError}
          hidden
        />
      </PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}
