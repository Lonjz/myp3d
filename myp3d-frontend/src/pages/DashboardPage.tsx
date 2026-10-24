import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Clock, DiscAlbum, Download, HardDrive, Image, MicVocal, Music, RefreshCw, Star } from 'lucide-react';
import { mp3Api } from '../api/mp3Api';
import type { LibraryStats } from '../api/mp3Api';
import { AdditionsChart } from '../components/dashboard/AdditionsChart';
import { ChartCardSkeleton } from '../components/dashboard/ChartCardSkeleton';
import { DurationChart } from '../components/dashboard/DurationChart';
import { LibraryHealth } from '../components/dashboard/LibraryHealth';
import { PlaylistsCard } from '../components/dashboard/PlaylistsCard';
import { StatTile, StatTileSkeleton } from '../components/dashboard/StatTile';
import { TopAlbums } from '../components/dashboard/TopAlbums';
import { TopArtistsChart } from '../components/dashboard/TopArtistsChart';
import { TrackListCard } from '../components/dashboard/TrackListCard';
import { useDownloadQueue } from '../components/downloads/downloadQueueContext';
import { useToast } from '../components/messages/toastContext';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { subscribeAppEvent } from '../utils/appEvents';
import { formatBytes, formatHours } from '../utils/formatters';

const STAT_TILE_COUNT = 7;
const CHART_SLOTS = ['chart-card--span-2', '', '', '', '', 'chart-card--tracks', 'chart-card--span-2 chart-card--albums'];

function DownloadsTile() {
  const { items, active } = useDownloadQueue();
  const unfinished = (items ?? []).filter((item) => item.status !== 'done' && item.status !== 'failed').length;
  if (unfinished === 0) return null;
  return (
    <StatTile label="Downloads" value={unfinished.toLocaleString()} icon={Download} to="/downloads" pulse={active} />
  );
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

  useEffect(() => subscribeAppEvent('library-changed', () => void loadStats()), [loadStats]);
  useEffect(() => subscribeAppEvent('favorites-changed', () => void loadStats()), [loadStats]);
  useEffect(() => subscribeAppEvent('playlists-changed', () => void loadStats()), [loadStats]);

  if (!stats) {
    return (
      <div className="page dashboard">
        {loading ? (
          <>
            <div className="stat-grid">
              {Array.from({ length: STAT_TILE_COUNT }, (_, index) => (
                <StatTileSkeleton key={index} />
              ))}
            </div>
            <div className="dashboard-grid">
              {CHART_SLOTS.map((className, index) => (
                <ChartCardSkeleton key={index} className={className} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState icon={CircleAlert} label="Couldn't load stats">
            <IconButton icon={RefreshCw} label="Retry" onClick={() => void loadStats()} />
          </EmptyState>
        )}
      </div>
    );
  }

  const coverRatio = stats.total_tracks ? stats.tracks_with_cover / stats.total_tracks : 0;

  return (
    <div className="page dashboard">
      <div className="stat-grid">
        <StatTile label="Tracks" value={stats.total_tracks.toLocaleString()} icon={Music} to="/library?issue=any" />
        <StatTile label="Albums" value={stats.total_albums.toLocaleString()} icon={DiscAlbum} to="/albums" />
        <StatTile label="Artists" value={stats.total_artists.toLocaleString()} icon={MicVocal} />
        <StatTile
          label="Favourites"
          value={stats.total_favorites.toLocaleString()}
          icon={Star}
          to="/library?favorites=1"
        />
        <StatTile label="Storage" value={formatBytes(stats.total_size)} icon={HardDrive} />
        <StatTile label="Playtime" value={formatHours(stats.total_duration)} icon={Clock} />
        <StatTile
          label="Covers"
          value={`${Math.round(coverRatio * 100)}%`}
          icon={Image}
          progress={coverRatio}
          to={coverRatio < 1 ? '/library?issue=cover' : undefined}
        />
        <DownloadsTile />
      </div>

      <div className="dashboard-grid">
        <AdditionsChart months={stats.additions_by_month} days={stats.additions_by_day} />
        <LibraryHealth health={stats.health} />
        <TopArtistsChart artists={stats.top_artists} />
        <DurationChart buckets={stats.duration_histogram} average={stats.average_duration} />
        <PlaylistsCard />
        <TrackListCard recent={stats.recent_tracks} favorites={stats.favorite_tracks} />
        <TopAlbums albums={stats.top_albums} />
      </div>
    </div>
  );
}
