import { GOOD_MATCH } from './useSpotifyImport';

const FAIR_MATCH = 0.5;

export function ExplicitBadge() {
  return (
    <span className="explicit-badge" title="Explicit" aria-label="Explicit">
      E
    </span>
  );
}

export function MatchDot({ score }: { score: number }) {
  const level = score >= GOOD_MATCH ? 'good' : score >= FAIR_MATCH ? 'fair' : 'poor';
  const label = `Match ${Math.round(score * 100)}%`;
  return <span className={`match-dot match-dot--${level}`} title={label} aria-label={label} />;
}
