import type { CSSProperties } from 'react';
import { ListMusic, Music, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { playlistApi } from '../../api/playlistApi';
import { CoverPlayButton } from '../player/CoverPlayButton';
import { usePlayer } from '../player/playerContext';
import { usePlaylists } from '../playlists/usePlaylists';
import { EmptyState } from '../ui/EmptyState';
import { ChartCard } from './ChartCard';

const PLAYLIST_LIMIT = 5;

export function PlaylistsCard() {
  const player = usePlayer();
  const { playlists } = usePlaylists();
  const recent = [...playlists].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, PLAYLIST_LIMIT);

  return (
    <ChartCard title="Playlists" icon={ListMusic}>
      {recent.length === 0 ? (
        <EmptyState icon={ListMusic} label="No playlists yet" compact />
      ) : (
        <ul className="recent-list">
          {recent.map((playlist, index) => (
            <li key={playlist.id} className="recent-row dash-rise" style={{ '--i': index } as CSSProperties}>
              <div className="recent-item__cover">
                <CoverPlayButton
                  src={playlist.has_cover ? playlistApi.coverUrl(playlist, 'thumb') : undefined}
                  label={`Play ${playlist.name}`}
                  icon={ListMusic}
                  isCurrent={false}
                  isPlaying={player.state.isPlaying}
                  onPlay={() => void player.playPlaylist(playlist.id)}
                  onToggle={player.togglePlay}
                />
              </div>
              <Link to={`/playlists/${encodeURIComponent(playlist.id)}`} className="recent-item">
                <div className="recent-item__text">
                  <span className="recent-item__heading">
                    <span className="recent-item__title">{playlist.name}</span>
                    {playlist.is_favorites && <Star className="recent-item__badge" aria-label="Favourites" />}
                  </span>
                </div>
                <span className="recent-item__count" title={`${playlist.track_count} tracks`}>
                  <Music aria-hidden="true" />
                  {playlist.track_count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
