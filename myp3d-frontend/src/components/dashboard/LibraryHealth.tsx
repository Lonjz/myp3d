import { ArrowRight, CircleAlert, CircleCheck, DiscAlbum, HeartPulse, Image, MicVocal, Type } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LibraryStats } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';

interface LibraryHealthProps {
  health: LibraryStats['health'];
}

export function LibraryHealth({ health }: LibraryHealthProps) {
  const checks = [
    { label: 'Title', icon: Type, missing: health.missing_title },
    { label: 'Artist', icon: MicVocal, missing: health.missing_artist },
    { label: 'Album', icon: DiscAlbum, missing: health.missing_album },
    { label: 'Cover art', icon: Image, missing: health.missing_cover },
  ];
  const hasIssues = checks.some((check) => check.missing > 0);

  return (
    <ChartCard title="Health" icon={HeartPulse}>
      <ul className="health-list">
        {checks.map(({ label, icon: Icon, missing }) => {
          const ok = missing === 0;
          return (
            <li
              key={label}
              className={`health-item ${ok ? 'is-ok' : 'is-warn'}`}
              title={ok ? `${label}: all tagged` : `${label}: ${missing} missing`}
            >
              <span className="health-item__field">
                <Icon aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </span>
              {ok ? (
                <CircleCheck className="health-item__status" aria-label="All tagged" />
              ) : (
                <span className="health-item__count">
                  {missing.toLocaleString()}
                  <CircleAlert className="health-item__status" aria-label="missing" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {hasIssues && (
        <Link to="/library" className="health-link" aria-label="Review in library" title="Review in library">
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
    </ChartCard>
  );
}
