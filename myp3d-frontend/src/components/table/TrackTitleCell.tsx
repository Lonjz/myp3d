import { Star } from 'lucide-react';

interface TrackTitleCellProps {
  title: string;
  subtitle?: string;
  favorite: boolean;
}

export function TrackTitleCell({ title, subtitle, favorite }: TrackTitleCellProps) {
  return (
    <span className="track-title-cell">
      <span className="track-title-cell__text">
        <span className="table-cell-ellipsis" title={title}>{title}</span>
        {subtitle && <span className="table-cell-subtitle" title={subtitle}>{subtitle}</span>}
      </span>
      {favorite && (
        <span className="favorite-badge" title="Favourite" aria-label="Favourite" role="img">
          <Star aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
