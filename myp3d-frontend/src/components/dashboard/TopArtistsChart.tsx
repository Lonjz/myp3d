import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LibraryStats } from '../../api/mp3Api';
import { ChartCard } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';
import { ANIMATE_CHARTS, AXIS_TICK, CHART_COLORS, MAX_BAR_SIZE, ROW_RADIUS } from './chartTheme';

interface TopArtistsChartProps {
  artists: LibraryStats['top_artists'];
}

const ROW_HEIGHT = 34;
const MAX_NAME_LENGTH = 16;

function truncate(name: string): string {
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

export function TopArtistsChart({ artists }: TopArtistsChartProps) {
  return (
    <ChartCard
      title="Top artists"
      subtitle="By track count"
      table={{
        columns: ['Artist', 'Tracks'],
        rows: artists.map((artist) => [artist.name, artist.track_count]),
      }}
    >
      {artists.length === 0 ? (
        <p className="chart-card__empty">No tagged artists yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={artists.length * ROW_HEIGHT + 8}>
          <BarChart data={artists} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={124}
              tick={{ ...AXIS_TICK, fill: CHART_COLORS.label }}
              tickFormatter={truncate}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: CHART_COLORS.cursor }}
              content={(props) => <ChartTooltip {...props} unit="tracks" />}
            />
            <Bar
              dataKey="track_count"
              fill={CHART_COLORS.series}
              activeBar={{ fill: CHART_COLORS.seriesActive }}
              radius={ROW_RADIUS}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={ANIMATE_CHARTS}
            >
              <LabelList dataKey="track_count" position="right" fill={CHART_COLORS.label} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
