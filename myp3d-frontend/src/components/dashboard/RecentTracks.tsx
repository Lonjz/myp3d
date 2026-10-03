import { History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mp3Api } from '../../api/mp3Api';
import type { MP3Info } from '../../api/mp3Api';
import { formatDuration } from '../../utils/formatters';
import { CoverPlayButton } from '../player/CoverPlayButton';
import { usePlayer } from '../player/playerContext';
import { ChartCard } from './ChartCard';

interface RecentTracksProps {
  tracks: MP3Info[];
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return '';
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days > -1) return 'Today';
  if (days > -30) return relativeTime.format(days, 'day');
  return new Date(value).toLocaleDateString();
}

export function RecentTracks({ tracks }: RecentTracksProps) {
  const player = usePlayer();

  return (
    <ChartCard title="Recent" icon={History}>
      {tracks.length === 0 ? (
        <p className="chart-card__empty">Nothing downloaded yet.</p>
      ) : (
        <ul className="recent-list">
          {tracks.map((track, index) => (
            <li key={track.filename} className="recent-row">
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
                  <span>{formatRelativeDate(track.date_added)}</span>
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
