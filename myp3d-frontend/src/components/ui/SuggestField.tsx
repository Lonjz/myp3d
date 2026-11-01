import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { IconField } from './IconField';

const LIST_GAP = 6;

export interface Suggestion {
  key: string;
  text: string;
  sub?: string;
  icon: LucideIcon;
  source: string;
  pick: () => void;
}

interface SuggestFieldProps extends ComponentProps<typeof IconField> {
  suggestions: Suggestion[];
}

export function SuggestField({ suggestions, onChange, onKeyDown, onBlur, ...props }: SuggestFieldProps) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = open && suggestions.length > 0 && !props.disabled;
  const current = active < suggestions.length ? active : -1;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const list = listRef.current;
    if (!shown || !anchor || !list) return;
    const rect = anchor.getBoundingClientRect();
    Object.assign(list.style, { top: `${rect.bottom + LIST_GAP}px`, left: `${rect.left}px`, width: `${rect.width}px`, visibility: 'visible' });
  }, [shown, suggestions]);

  useEffect(() => {
    if (!shown) return undefined;
    const close = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [shown]);

  const pick = (suggestion: Suggestion) => {
    suggestion.pick();
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive(shown ? (current + step + suggestions.length) % suggestions.length : step > 0 ? 0 : suggestions.length - 1);
      return;
    }
    if (!shown) return;
    if (event.key === 'Enter' && current >= 0) {
      event.preventDefault();
      pick(suggestions[current]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={anchorRef} className="suggest-field">
      <IconField
        {...props}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && current >= 0 ? `${listId}-${current}` : undefined}
        onChange={(event) => {
          onChange?.(event);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          onBlur?.(event);
          setOpen(false);
        }}
      />
      {shown &&
        createPortal(
          <ul ref={listRef} id={listId} className="suggest-list glass" role="listbox" aria-label={props.label}>
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <li
                  key={suggestion.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  className={`suggest-list__item${index === current ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(suggestion)}
                >
                  <Icon aria-label={suggestion.source} />
                  <span className="suggest-list__text">
                    <span className="suggest-list__title">{suggestion.text}</span>
                    {suggestion.sub && <span className="suggest-list__sub">{suggestion.sub}</span>}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
