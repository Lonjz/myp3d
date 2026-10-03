import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { ListOrdered, ListX, Music, X } from 'lucide-react';
import { mp3Api } from '../../api/mp3Api';
import { IconButton } from '../ui/IconButton';
import { NowPlayingIndicator } from './NowPlayingIndicator';
import { usePlayer } from './playerContext';

interface QueuePopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function QueuePopover({ anchorRef, onClose }: QueuePopoverProps) {
  const { state, jumpTo, remove, clear } = usePlayer();
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('.queue-row.is-current');
    if (!list || !row) return;
    const offset = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += offset - (list.clientHeight - row.offsetHeight) / 2;
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div ref={panelRef} className="queue-popover glass" role="dialog" aria-label="Queue">
      <div className="queue-popover__header">
        <span className="queue-popover__title">
          <ListOrdered aria-hidden="true" />
          <span>{state.queue.length}</span>
        </span>
        <IconButton
          icon={ListX}
          label="Clear queue"
          variant="ghost"
          size="sm"
          onClick={() => {
            clear();
            onClose();
          }}
        />
      </div>
      <ol ref={listRef} className="queue-list">
        {state.queue.map((track, index) => {
          const isCurrent = index === state.index;
          return (
            <li key={`${track.filename}-${index}`} className={isCurrent ? 'queue-row is-current' : 'queue-row'}>
              <button type="button" className="queue-row__main" onClick={() => jumpTo(index)}>
                <span className="queue-row__art">
                  {track.has_cover ? (
                    <img src={mp3Api.getCoverUrl(track.filename, 'thumb')} alt="" loading="lazy" />
                  ) : (
                    <Music aria-hidden="true" />
                  )}
                  {isCurrent && <NowPlayingIndicator playing={state.isPlaying} />}
                </span>
                <span className="queue-row__text">
                  <span className="queue-row__title">{track.title || track.filename}</span>
                  <span className="queue-row__artist">{track.artist || '—'}</span>
                </span>
              </button>
              <IconButton
                icon={X}
                label="Remove from queue"
                variant="ghost"
                size="sm"
                className="queue-row__remove"
                onClick={() => remove(index)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
