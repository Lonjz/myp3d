import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { Link } from 'react-router-dom';
import type { LibraryStats } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';

interface LibraryHealthProps {
  health: LibraryStats['health'];
  totalTracks: number;
}

export function LibraryHealth({ health, totalTracks }: LibraryHealthProps) {
  const checks = [
    { label: 'Title', missing: health.missing_title },
    { label: 'Artist', missing: health.missing_artist },
    { label: 'Album', missing: health.missing_album },
    { label: 'Cover art', missing: health.missing_cover },
  ];
  const hasIssues = checks.some((check) => check.missing > 0);

  return (
    <ChartCard title="Library health" subtitle="Tracks with complete metadata">
      <ul className="health-list">
        {checks.map((check) => {
          const ok = check.missing === 0;
          return (
            <li key={check.label} className={`health-item ${ok ? 'is-ok' : 'is-warn'}`}>
              {ok ? (
                <CheckCircleRoundedIcon fontSize="small" className="health-item__icon" />
              ) : (
                <ErrorOutlineRoundedIcon fontSize="small" className="health-item__icon" />
              )}
              <span className="health-item__label">{check.label}</span>
              <span className="health-item__value">
                {ok ? 'All tagged' : `${check.missing.toLocaleString()} of ${totalTracks.toLocaleString()} missing`}
              </span>
            </li>
          );
        })}
      </ul>
      {hasIssues && (
        <Link to="/library" className="health-link">
          Review in library →
        </Link>
      )}
    </ChartCard>
  );
}
