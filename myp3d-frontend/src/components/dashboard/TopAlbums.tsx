import { Link } from 'react-router-dom';
import { mp3Api } from '../../api/mp3Api';
import type { LibraryStats } from '../../api/mp3Api';
import { formatBytes } from '../../utils/formatters';
import { ChartCard } from './ChartCard';

interface TopAlbumsProps {
  albums: LibraryStats['top_albums'];
}

export function TopAlbums({ albums }: TopAlbumsProps) {
  return (
    <ChartCard title="Top albums" subtitle="By track count" className="chart-card--full">
      {albums.length === 0 ? (
        <p className="chart-card__empty">No albums yet.</p>
      ) : (
        <div className="album-tile-grid">
          {albums.map((album) => (
            <Link
              key={album.album_key}
              to={`/albums/${encodeURIComponent(album.album_key)}`}
              className="album-tile"
            >
              <div className="album-tile__cover">
                {album.has_cover ? (
                  <img src={mp3Api.getAlbumCoverUrl(album.album_key)} alt="" loading="lazy" />
                ) : (
                  <div className="no-cover">🎵</div>
                )}
              </div>
              <span className="album-tile__name" title={album.album_name}>{album.album_name}</span>
              <span className="album-tile__meta">
                {album.track_count} tracks · {formatBytes(album.total_size)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
