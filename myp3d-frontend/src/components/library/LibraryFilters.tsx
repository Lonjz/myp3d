import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Clock, HeartPulse, RotateCcw, SlidersHorizontal, Star, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MP3DurationRange, MP3Issue } from '../../api/mp3Api';
import { useLingering } from '../../hooks/usePresence';
import { IconButton } from '../ui/IconButton';
import type { IconOption } from '../ui/InlineSelect';
import { Popover } from '../ui/Popover';
import { DURATION_OPTIONS, FAVORITE_OPTIONS, ISSUE_OPTIONS } from './libraryFilterOptions';

interface LibraryFiltersProps {
  durationRange: MP3DurationRange;
  onDurationChange: (value: MP3DurationRange) => void;
  issue: MP3Issue;
  onIssueChange: (value: MP3Issue) => void;
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
}

export function LibraryFilters({
  durationRange,
  onDurationChange,
  issue,
  onIssueChange,
  favoritesOnly,
  onFavoritesChange,
}: LibraryFiltersProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const duration = durationRange === 'any' ? null : durationRange;
  const issueValue = issue === 'any' ? null : issue;
  const filtered = duration !== null || issueValue !== null || favoritesOnly;

  const reset = () => {
    onDurationChange('any');
    onIssueChange('any');
    onFavoritesChange(false);
  };

  const removeWith = (clear: () => void) => () => {
    clear();
    buttonRef.current?.focus();
  };

  return (
    <>
      <IconButton
        ref={buttonRef}
        icon={SlidersHorizontal}
        label="Filters"
        active={filtered}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      />
      <Popover
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        label="Filters"
        className="filter-panel"
        onKeyDown={moveFocus}
      >
        <FilterGroup
          icon={Clock}
          label="Duration in minutes"
          options={DURATION_OPTIONS}
          value={duration}
          onChange={(value) => onDurationChange(value ?? 'any')}
          showText
        />
        <FilterGroup
          icon={HeartPulse}
          label="Issues"
          options={ISSUE_OPTIONS}
          value={issueValue}
          onChange={(value) => onIssueChange(value ?? 'any')}
        />
        <div className="filter-panel__row">
          <IconButton
            icon={Star}
            label="Favourites only"
            variant="ghost"
            active={favoritesOnly}
            className={favoritesOnly ? 'favorite-toggle is-favorite' : 'favorite-toggle'}
            aria-pressed={favoritesOnly}
            onClick={() => onFavoritesChange(!favoritesOnly)}
          />
          <IconButton
            icon={RotateCcw}
            label="Reset filters"
            variant="ghost"
            className="filter-panel__reset"
            disabled={!filtered}
            onClick={reset}
          />
        </div>
      </Popover>
      <FilterChip
        label="Duration in minutes"
        value={duration}
        options={DURATION_OPTIONS}
        onRemove={removeWith(() => onDurationChange('any'))}
        showText
      />
      <FilterChip label="Issues" value={issueValue} options={ISSUE_OPTIONS} onRemove={removeWith(() => onIssueChange('any'))} />
      <FilterChip
        label="Favourites only"
        value={favoritesOnly ? 'favorites' : null}
        options={FAVORITE_OPTIONS}
        onRemove={removeWith(() => onFavoritesChange(false))}
        className="is-favorite"
      />
    </>
  );
}

interface FilterGroupProps<T extends string> {
  icon: LucideIcon;
  label: string;
  options: IconOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  showText?: boolean;
}

function FilterGroup<T extends string>({ icon: Icon, label, options, value, onChange, showText = false }: FilterGroupProps<T>) {
  return (
    <div className="filter-panel__row">
      <span className="filter-panel__icon" title={label}>
        <Icon aria-hidden="true" />
      </span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={['segmented__option', showText ? 'segmented__option--text' : '', option.value === value ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={option.value === value}
            aria-label={option.label}
            title={`${label}: ${option.label}`}
            onClick={() => onChange(option.value === value ? null : option.value)}
          >
            {showText ? option.label : <option.icon aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FilterChipProps<T extends string> {
  label: string;
  value: T | null;
  options: IconOption<T>[];
  onRemove: () => void;
  showText?: boolean;
  className?: string;
}

function FilterChip<T extends string>({ label, value, options, onRemove, showText = false, className }: FilterChipProps<T>) {
  const { value: shown, closing } = useLingering(value);
  const option = options.find((candidate) => candidate.value === shown);
  if (!option) return null;

  return (
    <button
      type="button"
      className={['filter-chip motion-pop', className].filter(Boolean).join(' ')}
      data-state={closing ? 'closed' : 'open'}
      aria-label={`Remove ${label}: ${option.label}`}
      title={`${label}: ${option.label}`}
      onClick={onRemove}
    >
      <option.icon className="filter-chip__icon" aria-hidden="true" />
      {showText && <span>{option.label}</span>}
      <X className="filter-chip__remove" aria-hidden="true" />
    </button>
  );
}

function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('.filter-panel__row')];
  const row = rows.find((candidate) => candidate.contains(document.activeElement));
  if (!row) return;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
    return;
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const next = rows[(rows.indexOf(row) + step + rows.length) % rows.length];
  const target = next.querySelector<HTMLElement>('[aria-pressed="true"]') ?? next.querySelector<HTMLElement>('button:not(:disabled)');
  target?.focus();
}
