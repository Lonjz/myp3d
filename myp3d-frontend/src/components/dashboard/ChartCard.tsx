import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export interface ChartTable {
  columns: [string, string];
  rows: Array<[string, string | number]>;
}

interface ChartCardProps {
  title: string;
  icon: LucideIcon;
  table?: ChartTable;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, icon: Icon, table, className, children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`chart-card glass ${className ?? ''}`.trim()}>
      <header className="chart-card__header">
        <h2 className="chart-card__title">
          <Icon aria-hidden="true" />
          {title}
        </h2>
        {table && (
          <IconButton
            icon={showTable ? ChartColumn : Table2}
            label={showTable ? 'Show chart' : 'Show table'}
            variant="ghost"
            size="sm"
            aria-pressed={showTable}
            onClick={() => setShowTable((value) => !value)}
          />
        )}
      </header>

      {table && showTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                <th scope="col">{table.columns[0]}</th>
                <th scope="col">{table.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([name, value]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{typeof value === 'number' ? value.toLocaleString() : value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
