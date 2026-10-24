import type { CSSProperties } from 'react';
import { History, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mp3Api } from '../../api/mp3Api';
import type { MP3Info } from '../../api/mp3Api';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDuration } from '../../utils/formatters';
import { CoverPlayButton } from '../player/CoverPlayButton';
import { usePlayer } from '../player/playerContext';
import { EmptyState } from '../ui/EmptyState';
import { ChartCard } from './ChartCard';

interface TrackListCardProps {
  recent: MP3Info[];
  favorites: MP3Info[];
}

type TrackListMode = 'recent' | 'favorites';

const MODES = [
  { value: 'recent', label: 'Recent', icon: History, empty: 'Nothing downloaded yet' },
  { value: 'favorites', label: 'Favourites', icon: Star, empty: 'No favourites yet' },
] as const;

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return '';
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days > -1) return 'Today';
  if (days > -30) return relativeTime.format(days, 'day');
  return new Date(value).toLocaleDateString();
}

export function TrackListCard({ recent, favorites }: TrackListCardProps) {
  const player = usePlayer();
  const [storedMode, setMode] = usePersistentState<TrackListMode>('dashboard:tracks-mode', 'recent');
  const mode: TrackListMode = storedMode === 'favorites' ? 'favorites' : 'recent';
  const current = MODES.find((option) => option.value === mode) ?? MODES[0];
  const tracks = mode === 'recent' ? recent : favorites;

  const toggle = (
    <div className="segmented segmented--sm" role="group" aria-label="Tracks">
      {MODES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={`segmented__option ${mode === value ? 'is-active' : ''}`.trim()}
          aria-pressed={mode === value}
          aria-label={label}
          title={label}
          onClick={() => setMode(value)}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  return (
    <ChartCard title={current.label} icon={current.icon} heading={toggle} className="chart-card--tracks">
      {tracks.length === 0 ? (
        <EmptyState icon={current.icon} label={current.empty} compact />
      ) : (
        <ul className="recent-list" key={mode}>
          {tracks.map((track, index) => (
            <li key={track.filename} className="recent-row dash-rise" style={{ '--i': index } as CSSProperties}>
              <div className="recent-item__cover">
                <CoverPlayButton
                  src={track.has_cover ? mp3Api.getCoverUrl(track.filename, 'thumb') : undefined}
                  label={`Play ${track.title || track.filename}`}
                  isCurrent={player.isCurrent(track.filename)}
                  isPlaying={player.state.isPlaying}
                  onPlay={() => player.playTracks(tracks, index)}
                  onToggle={player.togglePlay}
                />
              </div>
              <Link to={`/details/${encodeURIComponent(track.filename)}`} className="recent-item">
                <div className="recent-item__text">
                  <span className="recent-item__title">{track.title || track.filename}</span>
                  <span className="recent-item__artist">{track.artist || 'Unknown artist'}</span>
                </div>
                <div className="recent-item__meta">
                  {mode === 'recent' && <span>{formatRelativeDate(track.date_added)}</span>}
                  <span>{formatDuration(track.duration == null ? null : Math.round(track.duration))}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
