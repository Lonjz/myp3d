import type { CSSProperties } from 'react';
import { CircleAlert, CircleCheck, CopyX, DiscAlbum, HeartPulse, Image, ListMusic, MicVocal, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LibraryStats, MP3Issue } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';

interface LibraryHealthProps {
  health: LibraryStats['health'];
}

export function LibraryHealth({ health }: LibraryHealthProps) {
  const checks: Array<{ issue: MP3Issue; label: string; icon: LucideIcon; count: number }> = [
    { issue: 'title', label: 'Missing title', icon: Type, count: health.missing_title },
    { issue: 'artist', label: 'Missing artist', icon: MicVocal, count: health.missing_artist },
    { issue: 'album', label: 'Missing album', icon: DiscAlbum, count: health.missing_album },
    { issue: 'cover', label: 'Missing cover art', icon: Image, count: health.missing_cover },
    { issue: 'duplicate', label: 'Duplicates', icon: CopyX, count: health.duplicates },
    { issue: 'playlist', label: 'Not in a playlist', icon: ListMusic, count: health.unlisted },
  ];

  return (
    <ChartCard title="Health" icon={HeartPulse}>
      <ul className="health-list">
        {checks.map(({ issue, label, icon: Icon, count }, index) => {
          const ok = count === 0;
          const style = { '--i': index } as CSSProperties;
          const content = (
            <>
              <span className="health-item__field">
                <Icon aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </span>
              {ok ? (
                <CircleCheck className="health-item__status" aria-label="None" />
              ) : (
                <span className="health-item__count">
                  {count.toLocaleString()}
                  <CircleAlert className="health-item__status" aria-hidden="true" />
                </span>
              )}
            </>
          );
          return (
            <li key={issue} className="dash-rise" style={style}>
              {ok ? (
                <div className="health-item is-ok" title={`${label}: none`}>
                  {content}
                </div>
              ) : (
                <Link to={`/library?issue=${issue}`} className="health-item is-warn" title={`${label}: ${count}`}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
