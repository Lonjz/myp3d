export const CHART_COLORS = {
  series: 'var(--chart-series)',
  seriesActive: 'var(--chart-series-active)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  label: 'var(--color-text-secondary)',
  cursor: 'var(--color-surface-hover)',
} as const;

export const AXIS_TICK = { fill: CHART_COLORS.axis, fontSize: 12 } as const;

export const MAX_BAR_SIZE = 24;
export const COLUMN_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const ROW_RADIUS: [number, number, number, number] = [0, 4, 4, 0];

export const ANIMATE_CHARTS =
  typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
