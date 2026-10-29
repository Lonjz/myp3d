import { useEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface InlineSelectProps<T extends string> {
  label: string;
  value: T;
  options: IconOption<T>[];
  onChange: (value: T) => void;
}

export function InlineSelect<T extends string>({ label, value, options, onChange }: InlineSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (groupRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const choose = (next: T) => {
    if (!open) {
      setOpen(true);
      return;
    }
    onChange(next);
    setOpen(false);
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.inline-select__option')];

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttons.find((button) => button.classList.contains('is-active'))?.focus();
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={groupRef}
      className={open ? 'inline-select is-open' : 'inline-select'}
      role="group"
      aria-label={label}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const active = option.value === value;
        const visible = open || active;
        const title = active && !open ? `${label}: ${option.label}` : option.label;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? 'inline-select__option is-active' : 'inline-select__option'}
            aria-pressed={open ? active : undefined}
            aria-expanded={active ? open : undefined}
            aria-hidden={!visible}
            aria-label={title}
            title={title}
            tabIndex={visible ? 0 : -1}
            onClick={() => choose(option.value)}
          >
            <option.icon aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
