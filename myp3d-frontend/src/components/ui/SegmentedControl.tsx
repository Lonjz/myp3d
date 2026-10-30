import type { LucideIcon } from 'lucide-react';

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon?: LucideIcon;
  text?: string;
  dot?: boolean;
}

interface SegmentedControlProps<T> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  small?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string | number>({ label, options, value, onChange, small = false, disabled = false, className }: SegmentedControlProps<T>) {
  return (
    <div className={['segmented', small ? 'segmented--sm' : '', className].filter(Boolean).join(' ')} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__option ${option.value === value ? 'is-active' : ''}`.trim()}
          aria-pressed={option.value === value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.icon ? <option.icon aria-hidden="true" /> : option.text}
          {option.dot && <span className="segmented__dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
