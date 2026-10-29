import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const MENU_GAP = 6;
const VIEWPORT_GAP = 12;

export interface IconSelectOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface IconSelectProps<T extends string> {
  label: string;
  value: T;
  options: IconSelectOption<T>[];
  onChange: (value: T) => void;
  active?: boolean;
}

export function IconSelect<T extends string>({ label, value, options, onChange, active = false }: IconSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];
  const title = `${label}: ${current.label}`;

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!open || !trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const height = menu.offsetHeight;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left + (rect.width - menu.offsetWidth) / 2),
      window.innerWidth - menu.offsetWidth - VIEWPORT_GAP,
    );
    const below = rect.bottom + MENU_GAP;
    const top =
      below + height > window.innerHeight - VIEWPORT_GAP ? Math.max(VIEWPORT_GAP, rect.top - height - MENU_GAP) : below;
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px`, visibility: 'visible' });
    menu.querySelector<HTMLButtonElement>('.icon-select__option.is-active')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    };
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.icon-select__option') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={['icon-select', open ? 'is-open' : '', active ? 'is-active' : ''].filter(Boolean).join(' ')}
        aria-label={title}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <current.icon aria-hidden="true" />
        <ChevronDown className="icon-select__chevron" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="icon-select__menu glass motion-pop" role="group" aria-label={label} onKeyDown={moveFocus}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`icon-select__option ${option.value === value ? 'is-active' : ''}`.trim()}
                aria-pressed={option.value === value}
                aria-label={option.label}
                title={option.label}
                onClick={() => choose(option.value)}
              >
                <option.icon aria-hidden="true" />
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
