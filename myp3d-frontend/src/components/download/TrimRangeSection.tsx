import type { ChangeEvent, CSSProperties } from 'react';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import CropIcon from '@mui/icons-material/Crop';
import LoopIcon from '@mui/icons-material/Loop';
import NotInterestedIcon from '@mui/icons-material/NotInterested';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { formatDuration } from '../../utils/formatters';

interface TrimRangeSectionProps {
  duration: number | null;
  start: number;
  end: number;
  step?: number;
  disabled?: boolean;
  playhead?: number;
  isPlaying?: boolean;
  canPlay?: boolean;
  playHint?: string;
  onTogglePlay?: () => void;
  loopEnabled?: boolean;
  onToggleLoop?: () => void;
  mode: 'range' | 'playhead';
  onModeChange: (mode: 'range' | 'playhead') => void;
  canScrub?: boolean;
  onPlayheadChange?: (value: number) => void;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function TrimRangeSection({
  duration,
  start,
  end,
  step = 0.1,
  disabled = false,
  playhead,
  isPlaying = false,
  canPlay = false,
  playHint,
  onTogglePlay,
  loopEnabled = true,
  onToggleLoop,
  mode,
  onModeChange,
  canScrub = false,
  onPlayheadChange,
  onStartChange,
  onEndChange,
}: TrimRangeSectionProps) {
  const isDisabled = disabled || !duration || duration <= 0;
  const isScrubDisabled = disabled || !duration || duration <= 0 || !canScrub;
  const safeDuration = duration ?? 0;
  const minGap = Math.max(step, 0.1);
  const startPercent = safeDuration > 0 ? (start / safeDuration) * 100 : 0;
  const endPercent = safeDuration > 0 ? (end / safeDuration) * 100 : 0;
  const clipLength = Math.max(0, end - start);
  const playheadSeconds = playhead ?? start;
  const playheadPercent =
    safeDuration > 0 ? (clamp(playheadSeconds, 0, safeDuration) / safeDuration) * 100 : 0;

  const handleStartChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isDisabled || safeDuration <= 0) return;
    const value = Number(event.target.value);
    const nextStart = clamp(value, 0, Math.max(0, end - minGap));
    onStartChange(nextStart);
  };

  const handleEndChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isDisabled || safeDuration <= 0) return;
    const value = Number(event.target.value);
    const nextEnd = clamp(value, Math.min(safeDuration, start + minGap), safeDuration);
    onEndChange(nextEnd);
  };

  const handlePlayheadChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isScrubDisabled || safeDuration <= 0) return;
    const value = Number(event.target.value);
    onPlayheadChange?.(value);
  };

  const trackStyle = {
    '--trim-start': `${startPercent}%`,
    '--trim-end': `${endPercent}%`,
    '--trim-playhead': `${playheadPercent}%`,
  } as CSSProperties;

  return (
    <section className="trim-range-shell">
      <div className="trim-range-header">
        <div className="trim-range-controls">
          {onTogglePlay ? (
            <button
              type="button"
              className="btn-secondary btn-icon"
              onClick={onTogglePlay}
              disabled={!canPlay}
              aria-label={isPlaying ? 'Pause sample' : 'Play sample'}
              title={isPlaying ? 'Pause sample' : 'Play sample'}
            >
              {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
            </button>
          ) : null}
          {onToggleLoop ? (
            <button
              type="button"
              className="btn-secondary btn-icon"
              onClick={onToggleLoop}
              disabled={disabled}
              aria-label={loopEnabled ? 'Disable looping' : 'Enable looping'}
              title={loopEnabled ? 'Disable looping' : 'Enable looping'}
            >
              {loopEnabled ? <LoopIcon fontSize="small" /> : <NotInterestedIcon fontSize="small" />}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-icon"
            onClick={() => onModeChange(mode === 'range' ? 'playhead' : 'range')}
            disabled={disabled}
            aria-label={mode === 'range' ? 'Playhead' : 'Range'}
            title={mode === 'range' ? 'Playhead' : 'Range'}
          >
            {mode === 'range' ? <CropIcon fontSize="small" /> : <AudiotrackIcon fontSize="small" />}
          </button>
        </div>
        <span className="trim-range-duration">
          {safeDuration > 0 ? `Video: ${formatDuration(safeDuration)}` : 'Video duration unavailable'}
        </span>
      </div>

      <div
        className={`trim-range-track ${isDisabled ? 'is-disabled' : ''} ${
          mode === 'playhead' ? 'is-playhead' : ''
        }`}
        style={trackStyle}
      >
        {mode === 'range' ? (
          <>
            <input
              type="range"
              min={0}
              max={safeDuration}
              step={step}
              value={start}
              disabled={isDisabled}
              onChange={handleStartChange}
              className="trim-range-input trim-range-input-start"
              aria-label="Trim start time"
            />
            <input
              type="range"
              min={0}
              max={safeDuration}
              step={step}
              value={end}
              disabled={isDisabled}
              onChange={handleEndChange}
              className="trim-range-input trim-range-input-end"
              aria-label="Trim end time"
            />
          </>
        ) : (
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={step}
            value={playheadSeconds}
            disabled={isScrubDisabled}
            onChange={handlePlayheadChange}
            className="trim-playhead-input"
            aria-label="Player position"
          />
        )}
      </div>

      <div className="trim-range-values">
        <span>
          Start: <strong>{formatDuration(start)}</strong>
        </span>
        <span>
          End: <strong>{formatDuration(end)}</strong>
        </span>
        <span>
          Clip: <strong>{formatDuration(clipLength)}</strong>
        </span>
      </div>

      {playHint ? <div className="trim-range-hint input-help">{playHint}</div> : null}
    </section>
  );
}
