import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LibraryStats } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { ANIMATE_CHARTS, AXIS_TICK, CHART_COLORS, COLUMN_RADIUS, MAX_BAR_SIZE } from './chartTheme';

interface AdditionsChartProps {
  months: LibraryStats['additions_by_month'];
}

function parseMonth(month: string): Date {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year, monthIndex - 1, 1);
}

function isCurrentMonth(month: string): boolean {
  const now = new Date();
  const parsed = parseMonth(month);
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
}

function formatMonthShort(month: string): string {
  return parseMonth(month).toLocaleDateString(undefined, { month: 'short' });
}

function formatMonthLong(month: string): string {
  const label = parseMonth(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return isCurrentMonth(month) ? `${label} (so far)` : label;
}

export function AdditionsChart({ months }: AdditionsChartProps) {
  return (
    <ChartCard
      title="Tracks added"
      subtitle="Per month"
      className="chart-card--span-2"
      table={{
        columns: ['Month', 'Tracks'],
        rows: months.map((bucket) => [formatMonthLong(bucket.month), bucket.track_count]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHART_COLORS.cursor }}
            content={(props) => <ChartTooltip {...props} unit="tracks" formatLabel={formatMonthLong} />}
          />
          <Bar
            dataKey="track_count"
            fill={CHART_COLORS.series}
            activeBar={{ fill: CHART_COLORS.seriesActive }}
            radius={COLUMN_RADIUS}
            maxBarSize={MAX_BAR_SIZE}
            isAnimationActive={ANIMATE_CHARTS}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
