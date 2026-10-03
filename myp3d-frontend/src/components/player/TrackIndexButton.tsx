import { Pause, Play } from 'lucide-react';
import { NowPlayingIndicator } from './NowPlayingIndicator';

interface TrackIndexButtonProps {
  index: number;
  label: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onToggle: () => void;
}

export function TrackIndexButton({ index, label, isCurrent, isPlaying, onPlay, onToggle }: TrackIndexButtonProps) {
  const playingNow = isCurrent && isPlaying;
  const actionLabel = playingNow ? 'Pause' : label;
  const Icon = playingNow ? Pause : Play;

  return (
    <button
      type="button"
      className={isCurrent ? 'track-index is-current' : 'track-index'}
      aria-label={actionLabel}
      title={actionLabel}
      onClick={isCurrent ? onToggle : onPlay}
    >
      <span className="track-index__number">{playingNow ? <NowPlayingIndicator playing /> : index}</span>
      <Icon className="track-index__icon" aria-hidden="true" />
    </button>
  );
}
