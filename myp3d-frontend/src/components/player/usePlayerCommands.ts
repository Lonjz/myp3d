import { useMemo } from 'react';
import { ListX, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { useSpotlightCommands } from '../spotlight/useSpotlightCommands';
import type { SpotlightCommand } from '../spotlight/spotlightTypes';
import type { PlayerContextValue } from './playerContext';

const NEXT_REPEAT_TITLES = { off: 'Repeat all', all: 'Repeat one', one: 'Repeat off' } as const;

export function usePlayerCommands(player: PlayerContextValue): void {
  const { state } = player;
  const hasQueue = state.queue.length > 0;
  const { isPlaying, shuffle, repeat } = state;
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat, clear } = player;

  const commands = useMemo<SpotlightCommand[]>(() => {
    if (!hasQueue) return [];
    return [
      {
        id: 'toggle-play',
        title: isPlaying ? 'Pause' : 'Play',
        icon: isPlaying ? Pause : Play,
        keywords: ['resume', 'stop', 'music', 'playback'],
        run: togglePlay,
      },
      { id: 'next', title: 'Next track', icon: SkipForward, keywords: ['skip', 'forward'], run: next },
      { id: 'previous', title: 'Previous track', icon: SkipBack, keywords: ['back', 'rewind'], run: previous },
      {
        id: 'shuffle',
        title: shuffle ? 'Shuffle off' : 'Shuffle on',
        icon: Shuffle,
        keywords: ['random', 'mix'],
        run: toggleShuffle,
      },
      {
        id: 'repeat',
        title: NEXT_REPEAT_TITLES[repeat],
        icon: repeat === 'all' ? Repeat1 : Repeat,
        keywords: ['loop'],
        run: cycleRepeat,
      },
      { id: 'clear-queue', title: 'Clear queue', icon: ListX, keywords: ['stop', 'empty'], run: clear },
    ];
  }, [hasQueue, isPlaying, shuffle, repeat, togglePlay, next, previous, toggleShuffle, cycleRepeat, clear]);

  useSpotlightCommands('player', commands);
}
