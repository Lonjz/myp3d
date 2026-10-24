import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { History, Music } from 'lucide-react';
import type { LibraryStats } from '../../api/mp3Api';
import { usePersistentState } from '../../hooks/usePersistentState';

interface AdditionsCalendarProps {
  days: LibraryStats['additions_by_day'];
}

interface HoveredDay {
  date: string;
  count: number;
  left: number;
  top: number;
}

interface CalendarCell {
  date: Date;
  key: string;
  inRange: boolean;
}

const RECENT = 'recent';
const RECENT_WEEKS = 53;
const LEVELS = 4;
const MIN_LABEL_GAP = 3;

const pad = (value: number) => String(value).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function buildCells(range: string, today: Date): CalendarCell[] {
  let first: Date;
  let last: Date;
  if (range === RECENT) {
    first = new Date(today);
    first.setDate(today.getDate() - (RECENT_WEEKS - 1) * 7 - today.getDay());
    last = today;
  } else {
    const year = Number(range);
    first = new Date(year, 0, 1);
    last = new Date(year, 11, 31);
  }
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells: CalendarCell[] = [];
  for (const cursor = new Date(start); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    cells.push({ date: new Date(cursor), key: dayKey(cursor), inRange: cursor >= first && cursor <= today });
  }
  return cells;
}

function monthLabels(cells: CalendarCell[]): Array<{ column: number; label: string }> {
  const labels: Array<{ column: number; label: string }> = [];
  cells.forEach((cell, index) => {
    if (cell.date.getDate() !== 1 && !(index === 0 && cell.date.getDate() < 22)) return;
    const column = Math.floor(index / 7);
    const previous = labels[labels.length - 1];
    if (previous && column - previous.column < MIN_LABEL_GAP) labels.pop();
    labels.push({ column, label: cell.date.toLocaleDateString(undefined, { month: 'short' }) });
  });
  return labels;
}

export function AdditionsCalendar({ days }: AdditionsCalendarProps) {
  const [range, setRange] = usePersistentState('dashboard:additions-range', RECENT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredDay | null>(null);
  const today = startOfToday();
  const todayKey = dayKey(today);
  const counts = new Map(days.map((day) => [day.date, day.track_count]));
  const years = [...new Set([today.getFullYear(), ...days.map((day) => Number(day.date.slice(0, 4)))])].sort(
    (a, b) => b - a,
  );
  const activeRange = range === RECENT || years.includes(Number(range)) ? range : RECENT;
  const cells = buildCells(activeRange, today);
  const visible = cells.filter((cell) => cell.inRange).map((cell) => counts.get(cell.key) ?? 0);
  const max = Math.max(1, ...visible);
  const total = visible.reduce((sum, count) => sum + count, 0);
  const style = { '--weeks': Math.ceil(cells.length / 7) } as CSSProperties;
  const ranges = [
    { value: RECENT, label: 'Last 12 months' },
    ...years.map((year) => ({ value: String(year), label: String(year) })),
  ];

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const todayCell = scroller.querySelector<HTMLElement>('[data-today]');
    scroller.scrollLeft = todayCell ? todayCell.offsetLeft - scroller.clientWidth + todayCell.offsetWidth * 3 : 0;
  }, [activeRange]);

  const showDay = (event: MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-key]');
    const calendar = calendarRef.current;
    if (!cell || !calendar) {
      setHovered(null);
      return;
    }
    const cellRect = cell.getBoundingClientRect();
    const calendarRect = calendar.getBoundingClientRect();
    setHovered({
      date: cell.dataset.label ?? '',
      count: Number(cell.dataset.count ?? 0),
      left: cellRect.left - calendarRect.left + cellRect.width / 2,
      top: cellRect.top - calendarRect.top,
    });
  };

  return (
    <div className="calendar" ref={calendarRef}>
      <div className="calendar__main">
        <div className="calendar__scroll" ref={scrollRef} onScroll={() => setHovered(null)}>
          <div className="calendar__body" style={style}>
            <div className="calendar__months" aria-hidden="true">
              {monthLabels(cells).map(({ column, label }) => (
                <span key={`${column}-${label}`} style={{ gridColumn: column + 1 }}>
                  {label}
                </span>
              ))}
            </div>
            <div
              className="calendar__grid"
              role="img"
              aria-label="Tracks added per day"
              onMouseOver={showDay}
              onMouseLeave={() => setHovered(null)}
            >
              {cells.map((cell) => {
                if (!cell.inRange) return <span key={cell.key} className="calendar__day is-blank" />;
                const count = counts.get(cell.key) ?? 0;
                const level = count === 0 ? 0 : Math.min(LEVELS, Math.ceil((count / max) * LEVELS));
                return (
                  <span
                    key={cell.key}
                    className="calendar__day"
                    data-key={cell.key}
                    data-count={count}
                    data-label={cell.date.toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    data-level={level}
                    data-today={cell.key === todayKey || undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <div className="calendar__footer">
          <span className="calendar__total" title={`${total} tracks added`}>
            <Music aria-hidden="true" />
            {total.toLocaleString()}
          </span>
          <div className="calendar__legend" aria-hidden="true">
            {Array.from({ length: LEVELS + 1 }, (_, level) => (
              <span key={level} className="calendar__day" data-level={level} />
            ))}
          </div>
        </div>
      </div>
      {hovered && (
        <div className="chart-tooltip calendar__tooltip glass" style={{ left: hovered.left, top: hovered.top }}>
          <div className="chart-tooltip__value">
            <span className="chart-tooltip__key" aria-hidden="true" />
            <strong>{hovered.count.toLocaleString()}</strong>
            <span>{hovered.count === 1 ? 'track' : 'tracks'}</span>
          </div>
          <div className="chart-tooltip__label">{hovered.date}</div>
        </div>
      )}
      <div className="calendar__years" role="group" aria-label="Range">
        {ranges.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`calendar__year ${activeRange === value ? 'is-active' : ''}`.trim()}
            aria-pressed={activeRange === value}
            aria-label={label}
            title={label}
            onClick={() => setRange(value)}
          >
            {value === RECENT ? <History aria-hidden="true" /> : label}
          </button>
        ))}
      </div>
    </div>
  );
}
