import type { ReactNode } from 'react';
import { Check, Music, ScanSearch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Selection } from '../../hooks/useSelection';
import { cx } from '../../utils/formatters';
import { stopClick } from '../../utils/rowOpen';
import { Checkbox } from '../ui/Checkbox';
import { CountButton, IconButton } from '../ui/IconButton';

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

export function ChangeBadge({ icon: Icon, label, danger = false }: { icon: LucideIcon; label: string; danger?: boolean }) {
  return (
    <span className={cx('music-change', danger && 'music-change--danger')} title={label} aria-label={label}>
      <Icon aria-hidden="true" />
    </span>
  );
}

interface DiffColumnProps {
  icon: LucideIcon;
  label: string;
  count: number;
  children: ReactNode;
}

export function DiffColumn({ icon: Icon, label, count, children }: DiffColumnProps) {
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

export function BusyColumn({ busy, ...column }: DiffColumnProps & { busy: boolean }) {
  return (
    <div className={cx('health-columns', busy && 'is-busy')} aria-busy={busy}>
      <DiffColumn {...column} />
    </div>
  );
}

interface SelectableRowProps {
  rowKey: string;
  selection: Selection;
  title: string;
  sub: string;
  coverSrc?: string;
  coverIcon?: LucideIcon;
  children: ReactNode;
}

export function SelectableRow({ rowKey, selection, title, sub, coverSrc, coverIcon, children }: SelectableRowProps) {
  const selected = selection.selected.has(rowKey);
  return (
    <li className={cx('music-row is-clickable health-row', selected && 'is-selected')} onClick={() => selection.toggle(rowKey)}>
      <Checkbox label={`Select ${title}`} checked={selected} onChange={() => selection.toggle(rowKey)} onClick={stopClick} />
      <Cover src={coverSrc} icon={coverIcon} />
      <TrackText title={title} sub={sub} />
      {children}
    </li>
  );
}

interface BulkFixToolsProps {
  selection: Selection;
  locked: boolean;
  scanDisabled?: boolean;
  onScan: () => void;
  fixIcon: LucideIcon;
  fixLabel: string;
  fixTitle: string;
  onFix: () => void;
}

export function BulkFixTools({ selection, locked, scanDisabled = locked, onScan, fixIcon, fixLabel, fixTitle, onFix }: BulkFixToolsProps) {
  const count = selection.chosen.length;
  return (
    <>
      <span className="health-select-all">
        <Checkbox
          label={selection.allChosen ? 'Deselect all' : 'Select all'}
          checked={selection.allChosen}
          indeterminate={count > 0 && !selection.allChosen}
          onChange={selection.toggleAll}
          disabled={selection.keys.length === 0 || locked}
        />
      </span>
      <IconButton icon={ScanSearch} label="Scan again" className="sync-toolbar__push" onClick={onScan} disabled={scanDisabled} />
      <CountButton icon={fixIcon} count={count} className="health-fix" label={fixLabel} title={fixTitle} onClick={onFix} disabled={count === 0 || locked} />
    </>
  );
}
