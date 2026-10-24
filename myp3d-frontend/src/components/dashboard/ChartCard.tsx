import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChartCardProps {
  title: string;
  icon: LucideIcon;
  heading?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, icon: Icon, heading, actions, className, children }: ChartCardProps) {
  return (
    <section className={`chart-card glass ${className ?? ''}`.trim()}>
      <header className="chart-card__header">
        {heading ? (
          <>
            <h2 className="sr-only">{title}</h2>
            {heading}
          </>
        ) : (
          <h2 className="chart-card__title" title={title}>
            <Icon aria-hidden="true" />
            <span className="sr-only">{title}</span>
          </h2>
        )}
        {actions && <div className="chart-card__actions">{actions}</div>}
      </header>

      {children}
    </section>
  );
}
