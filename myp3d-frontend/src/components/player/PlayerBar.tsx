import { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ListOrdered,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { mp3Api } from '../../api/mp3Api';
import { IconButton } from '../ui/IconButton';
import { usePlayer } from './playerContext';
import { QueuePopover } from './QueuePopover';
import { SeekBar } from './SeekBar';

const REPEAT_LABELS = { off: 'Repeat', all: 'Repeat all', one: 'Repeat one' } as const;

export function PlayerBar() {
  const player = usePlayer();
  const { state, currentTrack } = player;
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const queueButtonRef = useRef<HTMLSpanElement>(null);
  const closeQueue = useCallback(() => setIsQueueOpen(false), []);

  if (!currentTrack) return null;

  const volumeLevel = state.muted ? 0 : state.volume;
  const VolumeIcon = volumeLevel === 0 ? VolumeX : volumeLevel < 0.5 ? Volume1 : Volume2;
  const volumeStyle = { '--progress': `${volumeLevel * 100}%` } as CSSProperties;
  const detailsPath = `/details/${encodeURIComponent(currentTrack.filename)}`;

  return (
    <div className="player-dock">
      <div className="player-dock__inner">
        <div className="player-bar glass" role="region" aria-label="Player">
          <SeekBar compact />

          <div className="player-bar__track">
            <Link to={detailsPath} className="player-bar__art" aria-label="Open track">
              {currentTrack.has_cover ? (
                <img src={mp3Api.getCoverUrl(currentTrack.filename, 'thumb')} alt="" />
              ) : (
                <Music aria-hidden="true" />
              )}
            </Link>
            <div key={currentTrack.filename} className="player-bar__text">
              <Link to={detailsPath} className="player-bar__title" title={currentTrack.title || currentTrack.filename}>
                {currentTrack.title || currentTrack.filename}
              </Link>
              <span className="player-bar__artist">{currentTrack.artist || '—'}</span>
            </div>
          </div>

          <div className="player-bar__center">
            <div className="player-bar__controls">
              <IconButton
                icon={Shuffle}
                label={state.shuffle ? 'Shuffle off' : 'Shuffle on'}
                variant="ghost"
                active={state.shuffle}
                className="player-bar__secondary"
                onClick={player.toggleShuffle}
              />
              <IconButton icon={SkipBack} label="Previous" variant="ghost" onClick={player.previous} />
              <IconButton
                icon={state.isPlaying ? Pause : Play}
                label={state.isPlaying ? 'Pause' : 'Play'}
                variant="primary"
                size="lg"
                className="player-bar__toggle"
                onClick={player.togglePlay}
              />
              <IconButton icon={SkipForward} label="Next" variant="ghost" onClick={player.next} />
              <IconButton
                icon={state.repeat === 'one' ? Repeat1 : Repeat}
                label={REPEAT_LABELS[state.repeat]}
                variant="ghost"
                active={state.repeat !== 'off'}
                className="player-bar__secondary"
                onClick={player.cycleRepeat}
              />
            </div>
            <SeekBar />
          </div>

          <div className="player-bar__side">
            <div className="player-bar__volume">
              <IconButton
                icon={VolumeIcon}
                label={state.muted ? 'Unmute' : 'Mute'}
                variant="ghost"
                size="sm"
                onClick={player.toggleMute}
              />
              <input
                className="seek-slider volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumeLevel}
                style={volumeStyle}
                aria-label="Volume"
                onChange={(event) => player.setVolume(Number(event.target.value))}
              />
            </div>
            <span ref={queueButtonRef} className="player-bar__queue">
              <IconButton
                icon={ListOrdered}
                label="Queue"
                variant="ghost"
                active={isQueueOpen}
                aria-expanded={isQueueOpen}
                onClick={() => setIsQueueOpen((open) => !open)}
              />
            </span>
          </div>
        </div>

        {isQueueOpen && <QueuePopover anchorRef={queueButtonRef} onClose={closeQueue} />}
      </div>
    </div>
  );
}
