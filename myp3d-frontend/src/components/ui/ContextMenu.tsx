import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

const VIEWPORT_GAP = 12;

export interface MenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  label: string;
  actions: MenuAction[];
  closing?: boolean;
  onClose: () => void;
}

const menuItems = (menu: HTMLElement | null) => [...(menu?.querySelectorAll<HTMLButtonElement>('.context-menu__item') ?? [])];

export function ContextMenu({ x, y, label, actions, closing = false, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const previous = document.activeElement;
    returnFocusRef.current = previous instanceof HTMLElement ? previous : null;
    const left = Math.max(VIEWPORT_GAP, Math.min(x, window.innerWidth - menu.offsetWidth - VIEWPORT_GAP));
    const top = Math.max(VIEWPORT_GAP, Math.min(y, window.innerHeight - menu.offsetHeight - VIEWPORT_GAP));
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px`, visibility: 'visible' });
    menuItems(menu)[0]?.focus();
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      returnFocusRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const choose = (action: MenuAction) => {
    onClose();
    action.run();
  };

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    items[targets[event.key]]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu glass motion-pop"
      role="menu"
      aria-label={label}
      data-state={closing ? 'closed' : 'open'}
      onKeyDown={moveFocus}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actions.map((action, index) => (
        <Fragment key={action.id}>
          {action.danger && index > 0 && !actions[index - 1].danger && (
            <div className="context-menu__divider" role="separator" />
          )}
          <button
            type="button"
            role="menuitem"
            className={action.danger ? 'context-menu__item is-danger' : 'context-menu__item'}
            onClick={() => choose(action)}
          >
            <action.icon aria-hidden="true" />
            <span>{action.label}</span>
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}
