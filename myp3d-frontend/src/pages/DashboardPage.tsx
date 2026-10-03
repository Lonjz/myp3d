import { useCallback, useEffect, useState } from 'react';
import { Clock, DiscAlbum, HardDrive, Image, MicVocal, Music, RefreshCw } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { LibraryStats } from '../api/mp3Api';
import { AdditionsChart } from '../components/dashboard/AdditionsChart';
import { DurationChart } from '../components/dashboard/DurationChart';
import { LibraryHealth } from '../components/dashboard/LibraryHealth';
import { RecentTracks } from '../components/dashboard/RecentTracks';
import { StatTile, StatTileSkeleton } from '../components/dashboard/StatTile';
import { TopAlbums } from '../components/dashboard/TopAlbums';
import { TopArtistsChart } from '../components/dashboard/TopArtistsChart';
import { useToast } from '../components/messages/ToastProvider';
import { IconButton } from '../components/ui/IconButton';
import { formatBytes, formatHours } from '../utils/formatters';

const STAT_TILE_COUNT = 6;

export function DashboardPage() {
  const { showError } = useToast();
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await mp3Api.getStats());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load library stats');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (!stats) {
    return (
      <div className="page dashboard">
        {loading ? (
          <div className="stat-grid">
            {Array.from({ length: STAT_TILE_COUNT }, (_, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
        ) : (
          <div className="dashboard-error glass">
            <p>Couldn't load stats</p>
            <IconButton icon={RefreshCw} label="Retry" onClick={() => void loadStats()} />
          </div>
        )}
      </div>
    );
  }

  const coverRatio = stats.total_tracks ? stats.tracks_with_cover / stats.total_tracks : 0;

  return (
    <div className="page dashboard">
      <div className="stat-grid">
        <StatTile label="Tracks" value={stats.total_tracks.toLocaleString()} icon={Music} />
        <StatTile label="Albums" value={stats.total_albums.toLocaleString()} icon={DiscAlbum} />
        <StatTile label="Artists" value={stats.total_artists.toLocaleString()} icon={MicVocal} />
        <StatTile label="Storage" value={formatBytes(stats.total_size)} icon={HardDrive} />
        <StatTile label="Listening time" value={formatHours(stats.total_duration)} icon={Clock} />
        <StatTile
          label="Cover art"
          value={`${Math.round(coverRatio * 100)}%`}
          icon={Image}
          progress={coverRatio}
        />
      </div>

      <div className="dashboard-grid">
        <AdditionsChart months={stats.additions_by_month} />
        <LibraryHealth health={stats.health} />
        <TopArtistsChart artists={stats.top_artists} />
        <DurationChart buckets={stats.duration_histogram} />
        <RecentTracks tracks={stats.recent_tracks} />
        <TopAlbums albums={stats.top_albums} />
      </div>
    </div>
  );
}
