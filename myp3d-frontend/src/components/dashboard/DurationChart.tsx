import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LibraryStats } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { ANIMATE_CHARTS, AXIS_TICK, CHART_COLORS, COLUMN_RADIUS, MAX_BAR_SIZE } from './chartTheme';

interface DurationChartProps {
  buckets: LibraryStats['duration_histogram'];
}

export function DurationChart({ buckets }: DurationChartProps) {
  return (
    <ChartCard
      title="Track length"
      subtitle="Number of tracks by duration"
      table={{
        columns: ['Length', 'Tracks'],
        rows: buckets.map((bucket) => [bucket.label, bucket.track_count]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHART_COLORS.cursor }}
            content={(props) => <ChartTooltip {...props} unit="tracks" />}
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
