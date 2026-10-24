import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LibraryStats, MP3DurationRange } from '../../api/mp3Api';
import { formatDuration } from '../../utils/formatters';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { ANIMATE_CHARTS, AXIS_TICK, CHART_COLORS, COLUMN_RADIUS, MAX_BAR_SIZE } from './chartTheme';

interface DurationChartProps {
  buckets: LibraryStats['duration_histogram'];
  average: number;
}

const BUCKET_BOUNDS: Record<Exclude<MP3DurationRange, 'any'>, [number, number]> = {
  'under-2': [0, 120],
  '2-3': [120, 180],
  '3-4': [180, 240],
  '4-5': [240, 300],
  '5-7': [300, 420],
  'over-7': [420, 600],
};

function averageMarker(buckets: LibraryStats['duration_histogram'], average: number) {
  const bucket = buckets.find(({ key }) => {
    if (key === 'any') return false;
    const [lower, upper] = BUCKET_BOUNDS[key];
    return average >= lower && (average < upper || key === 'over-7');
  });
  if (!bucket || bucket.key === 'any') return null;
  const [lower, upper] = BUCKET_BOUNDS[bucket.key];
  const fraction = (average - lower) / (upper - lower);
  const position = fraction < 1 / 3 ? 'start' : fraction > 2 / 3 ? 'end' : 'middle';
  return { label: bucket.label, position } as const;
}

export function DurationChart({ buckets, average }: DurationChartProps) {
  const navigate = useNavigate();
  const marker = average > 0 ? averageMarker(buckets, average) : null;

  return (
    <ChartCard title="Duration" icon={Clock}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={buckets} margin={{ top: 22, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: CHART_COLORS.cursor }}
            content={(props) => <ChartTooltip {...props} unit="tracks" />}
          />
          {marker && (
            <ReferenceLine
              x={marker.label}
              position={marker.position}
              stroke={CHART_COLORS.marker}
              strokeDasharray="4 4"
              label={{ value: `avg ${formatDuration(Math.round(average))}`, position: 'top', fill: CHART_COLORS.label, fontSize: 11 }}
            />
          )}
          <Bar
            dataKey="track_count"
            fill={CHART_COLORS.series}
            activeBar={{ fill: CHART_COLORS.seriesActive }}
            radius={COLUMN_RADIUS}
            maxBarSize={MAX_BAR_SIZE}
            isAnimationActive={ANIMATE_CHARTS}
            cursor="pointer"
            onClick={(_, index) => navigate(`/library?duration=${buckets[index].key}`)}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
