import { useCallback, useEffect, useState } from 'react';
import AlbumRoundedIcon from '@mui/icons-material/AlbumRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import LibraryMusicRoundedIcon from '@mui/icons-material/LibraryMusicRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
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
import { formatBytes, formatDuration, formatHours } from '../utils/formatters';

const STAT_TILE_COUNT = 6;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
        <header className="dashboard-header">
          <h1>Dashboard</h1>
        </header>
        {loading ? (
          <div className="stat-grid">
            {Array.from({ length: STAT_TILE_COUNT }, (_, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </div>
        ) : (
          <div className="dashboard-error">
            <p>Couldn't load library stats. Is the backend running?</p>
            <button type="button" className="btn-secondary" onClick={() => void loadStats()}>
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  const addedThisMonth =
    stats.additions_by_month.find((bucket) => bucket.month === currentMonthKey())?.track_count ?? 0;
  const coverRatio = stats.total_tracks ? stats.tracks_with_cover / stats.total_tracks : 0;

  return (
    <div className="page dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="dashboard-subtitle">An overview of your library</p>
      </header>

      <div className="stat-grid">
        <StatTile
          label="Tracks"
          value={stats.total_tracks.toLocaleString()}
          icon={<LibraryMusicRoundedIcon fontSize="small" />}
          detail={`${addedThisMonth.toLocaleString()} added this month`}
        />
        <StatTile
          label="Albums"
          value={stats.total_albums.toLocaleString()}
          icon={<AlbumRoundedIcon fontSize="small" />}
          detail={
            stats.total_albums
              ? `${(stats.total_tracks / stats.total_albums).toFixed(1)} tracks per album`
              : undefined
          }
        />
        <StatTile
          label="Artists"
          value={stats.total_artists.toLocaleString()}
          icon={<PersonRoundedIcon fontSize="small" />}
          detail={stats.top_artists[0] ? `Most tracks: ${stats.top_artists[0].name}` : undefined}
        />
        <StatTile
          label="Storage"
          value={formatBytes(stats.total_size)}
          icon={<StorageRoundedIcon fontSize="small" />}
          detail={`${formatBytes(stats.average_size)} per track on average`}
        />
        <StatTile
          label="Listening time"
          value={formatHours(stats.total_duration)}
          icon={<ScheduleRoundedIcon fontSize="small" />}
          detail={`${formatDuration(Math.round(stats.average_duration))} per track on average`}
        />
        <StatTile
          label="Cover art"
          value={`${Math.round(coverRatio * 100)}%`}
          icon={<ImageRoundedIcon fontSize="small" />}
          progress={coverRatio}
          detail={`${stats.tracks_with_cover.toLocaleString()} of ${stats.total_tracks.toLocaleString()} tracks`}
        />
      </div>

      <div className="dashboard-grid">
        <AdditionsChart months={stats.additions_by_month} />
        <LibraryHealth health={stats.health} totalTracks={stats.total_tracks} />
        <TopArtistsChart artists={stats.top_artists} />
        <DurationChart buckets={stats.duration_histogram} />
        <RecentTracks tracks={stats.recent_tracks} />
        <TopAlbums albums={stats.top_albums} />
      </div>
    </div>
  );
}
