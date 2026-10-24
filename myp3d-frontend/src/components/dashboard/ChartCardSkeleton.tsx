interface ChartCardSkeletonProps {
  className?: string;
}

export function ChartCardSkeleton({ className }: ChartCardSkeletonProps) {
  return (
    <div className={`chart-card chart-card--loading glass ${className ?? ''}`.trim()} aria-hidden="true">
      <span className="skeleton skeleton--bubble" />
      <span className="skeleton skeleton--block" />
    </div>
  );
}
