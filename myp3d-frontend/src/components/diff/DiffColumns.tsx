import type { ReactNode } from 'react';
import { Check, Music } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function Cover({ src, icon: Icon = Music }: { src?: string; icon?: LucideIcon }) {
  return (
    <span className="music-cover" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <Icon />}
    </span>
  );
}

export function TrackText({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="music-row__text">
      <span className="music-row__title" title={title}>{title}</span>
      {sub && <span className="music-row__sub" title={sub}>{sub}</span>}
    </div>
  );
}

export function DiffColumn({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="music-column glass" aria-label={label}>
      <header className="music-column__header">
        <span className="music-column__heading" title={label}>
          <Icon className="music-column__icon" aria-hidden="true" />
          <span className="album-chip music-column__count">{count}</span>
        </span>
      </header>
      {count > 0 ? (
        <ul className="music-rows">{children}</ul>
      ) : (
        <div className="music-column__empty" aria-hidden="true">
          <Check />
        </div>
      )}
    </section>
  );
}
