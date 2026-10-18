import { useEffect, useState } from 'react';
import { DiscAlbum, Download, Music } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { exportApi } from '../api/exportApi';
import { mp3Api } from '../api/mp3Api';
import type { LibraryStats } from '../api/mp3Api';
import { subscribeAppEvent } from '../utils/appEvents';
import { formatBytes } from '../utils/formatters';

interface ExportTileProps {
  icon: LucideIcon;
  label: string;
  detail: string;
  href: string;
  disabled: boolean;
}

function ExportTile({ icon: Icon, label, detail, href, disabled }: ExportTileProps) {
  return (
    <section className="export-tile glass" aria-label={label}>
      <span className="export-tile__icon" aria-hidden="true">
        <Icon />
      </span>
      <a
        className="btn-primary export-tile__download"
        href={disabled ? undefined : href}
        aria-disabled={disabled}
        title={detail ? `${label} · ${detail}` : label}
      >
        <Download aria-hidden="true" />
        {label}
      </a>
    </section>
  );
}

export function ExportPage() {
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);

  useEffect(() => subscribeAppEvent('library-changed', () => setLibraryVersion((version) => version + 1)), []);

  useEffect(() => {
    let cancelled = false;
    mp3Api.getStats().then(
      (next) => {
        if (!cancelled) setStats(next);
      },
      () => {
        if (!cancelled) setStats(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [libraryVersion]);

  const trackDetail = stats ? `${stats.total_tracks} tracks · ${formatBytes(stats.total_size)}` : '';
  const albumDetail = stats ? `${stats.total_albums} albums` : '';

  return (
    <div className="page export-page">
      <div className="export-tiles">
        <ExportTile
          icon={Music}
          label="Tracks"
          detail={trackDetail}
          href={exportApi.tracksUrl()}
          disabled={!stats || stats.total_tracks === 0}
        />
        <ExportTile
          icon={DiscAlbum}
          label="Album art"
          detail={albumDetail}
          href={exportApi.albumArtUrl()}
          disabled={!stats || stats.tracks_with_cover === 0}
        />
      </div>
    </div>
  );
}
