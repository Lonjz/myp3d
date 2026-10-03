import type { MP3Info } from '../../api/mp3Api';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerState {
  queue: MP3Info[];
  originalQueue: MP3Info[] | null;
  index: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
}

export type PersistedPlayerState = Omit<PlayerState, 'isPlaying'>;

export type PlayerAction =
  | { type: 'playTracks'; tracks: MP3Info[]; startIndex: number; shuffle?: boolean; seed: number }
  | { type: 'playNext'; track: MP3Info }
  | { type: 'enqueue'; tracks: MP3Info[] }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'ended' }
  | { type: 'jumpTo'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'clear' }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'toggleShuffle'; seed: number }
  | { type: 'cycleRepeat' }
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleMute' }
  | { type: 'trackUpdated'; oldFilename: string; track: MP3Info }
  | { type: 'syncLibrary'; tracks: MP3Info[] };

export const initialPlayerState: PlayerState = {
  queue: [],
  originalQueue: null,
  index: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'off',
  volume: 1,
  muted: false,
};

const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function shuffleAround(tracks: MP3Info[], keepIndex: number, seed: number): MP3Info[] {
  const kept = tracks[keepIndex];
  if (!kept) return shuffled(tracks, seed);
  return [kept, ...shuffled(tracks.filter((_, i) => i !== keepIndex), seed)];
}

function withoutFirst(tracks: MP3Info[], filename: string): MP3Info[] {
  const position = tracks.findIndex((track) => track.filename === filename);
  return position < 0 ? tracks : tracks.filter((_, i) => i !== position);
}

function removeAt(state: PlayerState, index: number): PlayerState {
  const removed = state.queue[index];
  if (!removed) return state;

  const queue = state.queue.filter((_, i) => i !== index);
  if (queue.length === 0) {
    return { ...state, queue: [], originalQueue: null, index: -1, isPlaying: false };
  }

  const originalQueue = state.originalQueue ? withoutFirst(state.originalQueue, removed.filename) : null;
  let nextIndex = state.index;
  let isPlaying = state.isPlaying;

  if (index < state.index) {
    nextIndex -= 1;
  } else if (index === state.index && nextIndex >= queue.length) {
    nextIndex = queue.length - 1;
    isPlaying = false;
  }

  return { ...state, queue, originalQueue, index: nextIndex, isPlaying };
}

function replaceTrack(tracks: MP3Info[], filename: string, track: MP3Info): MP3Info[] {
  return tracks.map((entry) => (entry.filename === filename ? track : entry));
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'playTracks': {
      if (action.tracks.length === 0) return state;
      const startIndex = Math.min(Math.max(action.startIndex, 0), action.tracks.length - 1);
      const shuffle = action.shuffle ?? state.shuffle;
      if (shuffle) {
        return {
          ...state,
          queue: shuffleAround(action.tracks, startIndex, action.seed),
          originalQueue: action.tracks,
          index: 0,
          shuffle: true,
          isPlaying: true,
        };
      }
      return { ...state, queue: action.tracks, originalQueue: null, index: startIndex, shuffle: false, isPlaying: true };
    }

    case 'playNext': {
      if (state.queue.length === 0) {
        return { ...state, queue: [action.track], originalQueue: state.shuffle ? [action.track] : null, index: 0, isPlaying: true };
      }
      const queue = [...state.queue.slice(0, state.index + 1), action.track, ...state.queue.slice(state.index + 1)];
      let originalQueue = state.originalQueue;
      if (originalQueue) {
        const current = state.queue[state.index];
        const position = originalQueue.findIndex((track) => track.filename === current?.filename);
        originalQueue = [...originalQueue.slice(0, position + 1), action.track, ...originalQueue.slice(position + 1)];
      }
      return { ...state, queue, originalQueue };
    }

    case 'enqueue': {
      if (action.tracks.length === 0) return state;
      return {
        ...state,
        queue: [...state.queue, ...action.tracks],
        originalQueue: state.originalQueue ? [...state.originalQueue, ...action.tracks] : null,
        index: state.queue.length === 0 ? 0 : state.index,
      };
    }

    case 'next': {
      if (state.queue.length === 0) return state;
      if (state.index < state.queue.length - 1) return { ...state, index: state.index + 1, isPlaying: true };
      if (state.repeat === 'all') return { ...state, index: 0, isPlaying: true };
      return { ...state, index: 0, isPlaying: false };
    }

    case 'prev': {
      if (state.queue.length === 0) return state;
      if (state.index > 0) return { ...state, index: state.index - 1, isPlaying: true };
      if (state.repeat === 'all') return { ...state, index: state.queue.length - 1, isPlaying: true };
      return state;
    }

    case 'ended': {
      if (state.queue.length === 0) return state;
      if (state.index < state.queue.length - 1) return { ...state, index: state.index + 1, isPlaying: true };
      if (state.repeat === 'all') return { ...state, index: 0, isPlaying: true };
      return { ...state, isPlaying: false };
    }

    case 'jumpTo':
      if (!state.queue[action.index]) return state;
      return { ...state, index: action.index, isPlaying: true };

    case 'remove':
      return removeAt(state, action.index);

    case 'clear':
      return { ...state, queue: [], originalQueue: null, index: -1, isPlaying: false };

    case 'setPlaying':
      if (state.queue.length === 0 || state.isPlaying === action.playing) return state;
      return { ...state, isPlaying: action.playing };

    case 'toggleShuffle': {
      if (!state.shuffle) {
        if (state.queue.length === 0) return { ...state, shuffle: true };
        return {
          ...state,
          shuffle: true,
          originalQueue: state.queue,
          queue: shuffleAround(state.queue, state.index, action.seed),
          index: 0,
        };
      }
      if (!state.originalQueue) return { ...state, shuffle: false };
      const current = state.queue[state.index];
      const restoredIndex = state.originalQueue.findIndex((track) => track.filename === current?.filename);
      return {
        ...state,
        shuffle: false,
        queue: state.originalQueue,
        originalQueue: null,
        index: Math.max(0, restoredIndex),
      };
    }

    case 'cycleRepeat':
      return { ...state, repeat: REPEAT_ORDER[(REPEAT_ORDER.indexOf(state.repeat) + 1) % REPEAT_ORDER.length] };

    case 'setVolume': {
      const volume = Math.min(1, Math.max(0, action.volume));
      return { ...state, volume, muted: volume === 0 ? state.muted : false };
    }

    case 'toggleMute':
      return { ...state, muted: !state.muted };

    case 'trackUpdated':
      return {
        ...state,
        queue: replaceTrack(state.queue, action.oldFilename, action.track),
        originalQueue: state.originalQueue ? replaceTrack(state.originalQueue, action.oldFilename, action.track) : null,
      };

    case 'syncLibrary': {
      const byFilename = new Map(action.tracks.map((track) => [track.filename, track]));
      let next = state;
      for (let i = next.queue.length - 1; i >= 0; i -= 1) {
        if (!byFilename.has(next.queue[i].filename)) next = removeAt(next, i);
      }
      const refresh = (tracks: MP3Info[]) => tracks.map((track) => byFilename.get(track.filename) ?? track);
      return {
        ...next,
        queue: refresh(next.queue),
        originalQueue: next.originalQueue ? refresh(next.originalQueue).filter((track) => byFilename.has(track.filename)) : null,
      };
    }

    default:
      return state;
  }
}

export function restorePlayerState(saved: Partial<PersistedPlayerState> | null): PlayerState {
  if (!saved || !Array.isArray(saved.queue)) return initialPlayerState;
  const queue = saved.queue.filter((track) => track && typeof track.filename === 'string');
  const index = typeof saved.index === 'number' && queue[saved.index] ? saved.index : queue.length > 0 ? 0 : -1;
  return {
    queue,
    originalQueue: Array.isArray(saved.originalQueue) ? saved.originalQueue : null,
    index,
    isPlaying: false,
    shuffle: Boolean(saved.shuffle),
    repeat: saved.repeat && REPEAT_ORDER.includes(saved.repeat) ? saved.repeat : 'off',
    volume: typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 1,
    muted: Boolean(saved.muted),
  };
}
