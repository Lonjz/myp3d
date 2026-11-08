import { cx } from '../../utils/formatters';

interface ChartCardSkeletonProps {
  className?: string;
}

export function ChartCardSkeleton({ className }: ChartCardSkeletonProps) {
  return (
    <div className={cx('chart-card chart-card--loading glass', className)} aria-hidden="true">
      <span className="skeleton skeleton--bubble" />
      <span className="skeleton skeleton--block" />
    </div>
  );
}
