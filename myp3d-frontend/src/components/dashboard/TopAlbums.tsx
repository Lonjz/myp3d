import type { CSSProperties } from 'react';
import { DiscAlbum, Music, Pause, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { mp3Api } from '../../api/mp3Api';
import type { LibraryStats } from '../../api/mp3Api';
import { formatBytes } from '../../utils/formatters';
import { usePlayer } from '../player/playerContext';
import { IconButton } from '../ui/IconButton';
import { ChartCard } from './ChartCard';

interface TopAlbumsProps {
  albums: LibraryStats['top_albums'];
}

export function TopAlbums({ albums }: TopAlbumsProps) {
  const player = usePlayer();
  const currentAlbumName = (player.currentTrack?.album || '').trim().toLowerCase();

  return (
    <ChartCard title="Top albums" icon={DiscAlbum} className="chart-card--full">
      {albums.length === 0 ? (
        <p className="chart-card__empty">No albums yet.</p>
      ) : (
        <div className="album-tile-grid">
          {albums.map((album, index) => {
            const isCurrent = player.currentTrack !== null && currentAlbumName === album.album_name.toLowerCase();
            const playingNow = isCurrent && player.state.isPlaying;
            return (
              <div
                key={album.album_key}
                className={isCurrent ? 'album-tile-wrap dash-rise is-current' : 'album-tile-wrap dash-rise'}
                style={{ '--i': index } as CSSProperties}
              >
                <Link to={`/albums/${encodeURIComponent(album.album_key)}`} className="album-tile">
                  <div className="album-tile__cover">
                    {album.has_cover ? (
                      <img src={mp3Api.getAlbumCoverUrl(album.album_key, 'medium')} alt="" loading="lazy" />
                    ) : (
                      <Music className="album-tile__placeholder" aria-hidden="true" />
                    )}
                  </div>
                  <span className="album-tile__name" title={album.album_name}>{album.album_name}</span>
                  <span className="album-tile__meta">
                    {album.track_count} tracks · {formatBytes(album.total_size)}
                  </span>
                </Link>
                <div className="album-tile__play-zone">
                  <IconButton
                    icon={playingNow ? Pause : Play}
                    label={playingNow ? 'Pause' : `Play ${album.album_name}`}
                    variant="primary"
                    className="album-tile__play"
                    onClick={() => (isCurrent ? player.togglePlay() : void player.playAlbum(album.album_key))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
