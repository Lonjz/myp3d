import type { TooltipContentProps } from 'recharts';

interface ChartTooltipProps extends TooltipContentProps {
  unit: string;
  formatLabel?: (label: string) => string;
}

export function ChartTooltip({ active, payload, label, unit, formatLabel }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const value = Number(payload[0].value ?? 0);
  const category = String(label ?? '');

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__value">
        <span className="chart-tooltip__key" aria-hidden="true" />
        <strong>{value.toLocaleString()}</strong>
        <span>{value === 1 ? unit.replace(/s$/, '') : unit}</span>
      </div>
      <div className="chart-tooltip__label">{formatLabel ? formatLabel(category) : category}</div>
    </div>
  );
}
