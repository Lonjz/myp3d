import { useState } from 'react';
import type { ReactNode } from 'react';

export interface ChartTable {
  columns: [string, string];
  rows: Array<[string, string | number]>;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  table?: ChartTable;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, table, className, children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`chart-card ${className ?? ''}`.trim()}>
      <header className="chart-card__header">
        <div>
          <h2 className="chart-card__title">{title}</h2>
          {subtitle && <p className="chart-card__subtitle">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="chart-card__toggle"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
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
