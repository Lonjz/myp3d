import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatDuration } from '../../utils/formatters';
import { usePlayer, usePlayerTime } from './playerContext';

export function SeekBar({ compact = false }: { compact?: boolean }) {
  const { seek } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const max = duration > 0 ? duration : 0;
  const shown = Math.min(scrubTime ?? currentTime, max || Infinity);
  const progress = max > 0 ? (shown / max) * 100 : 0;
  const style = { '--progress': `${progress}%` } as CSSProperties;

  const commit = () => {
    if (scrubTime !== null) seek(scrubTime);
    draggingRef.current = false;
    setScrubTime(null);
  };

  const slider = (
    <input
      className="seek-slider"
      type="range"
      min={0}
      max={max || 1}
      step={0.1}
      value={max > 0 ? shown : 0}
      disabled={max <= 0}
      style={style}
      aria-label="Seek"
      aria-valuetext={`${formatDuration(Math.floor(shown))} of ${formatDuration(Math.floor(max))}`}
      onPointerDown={() => {
        draggingRef.current = true;
      }}
      onPointerUp={commit}
      onPointerCancel={commit}
      onChange={(event) => {
        const value = Number(event.target.value);
        if (draggingRef.current) {
          setScrubTime(value);
        } else {
          seek(value);
        }
      }}
    />
  );

  if (compact) {
    return <div className="seek-bar seek-bar--compact">{slider}</div>;
  }

  return (
    <div className="seek-bar">
      <span className="seek-bar__time">{formatDuration(Math.floor(shown))}</span>
      {slider}
      <span className="seek-bar__time">{formatDuration(Math.floor(max))}</span>
    </div>
  );
}
