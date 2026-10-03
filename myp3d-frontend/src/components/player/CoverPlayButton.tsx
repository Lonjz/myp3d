import { Music, Pause, Play } from 'lucide-react';
import { NowPlayingIndicator } from './NowPlayingIndicator';

interface CoverPlayButtonProps {
  src?: string;
  label: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onToggle: () => void;
  className?: string;
}

export function CoverPlayButton({ src, label, isCurrent, isPlaying, onPlay, onToggle, className }: CoverPlayButtonProps) {
  const playingNow = isCurrent && isPlaying;
  const classes = ['cover-play', isCurrent ? 'is-current' : '', className].filter(Boolean).join(' ');
  const actionLabel = playingNow ? 'Pause' : label;

  return (
    <button
      type="button"
      className={classes}
      aria-label={actionLabel}
      title={actionLabel}
      onClick={isCurrent ? onToggle : onPlay}
    >
      {src ? <img src={src} alt="" loading="lazy" /> : <Music className="cover-play__placeholder" aria-hidden="true" />}
      <span className="cover-play__overlay" aria-hidden="true">
        {playingNow && <NowPlayingIndicator playing />}
        {playingNow ? <Pause className="cover-play__icon" /> : <Play className="cover-play__icon" />}
      </span>
    </button>
  );
}
