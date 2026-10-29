import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../../hooks/usePresence';

const POPOVER_GAP = 6;
const VIEWPORT_GAP = 12;

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  label: string;
  role?: 'dialog' | 'group';
  align?: 'center' | 'end';
  className?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function Popover({
  anchorRef,
  open,
  onClose,
  label,
  role = 'dialog',
  align = 'center',
  className,
  onKeyDown,
  children,
}: PopoverProps) {
  const { mounted, closing } = usePresence(open);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const height = panel.offsetHeight;
    const preferredLeft = align === 'end' ? rect.right - panel.offsetWidth : rect.left + (rect.width - panel.offsetWidth) / 2;
    const left = Math.min(Math.max(VIEWPORT_GAP, preferredLeft), window.innerWidth - panel.offsetWidth - VIEWPORT_GAP);
    const below = rect.bottom + POPOVER_GAP;
    const top =
      below + height > window.innerHeight - VIEWPORT_GAP ? Math.max(VIEWPORT_GAP, rect.top - height - POPOVER_GAP) : below;
    Object.assign(panel.style, { top: `${top}px`, left: `${left}px`, visibility: 'visible' });
    const initial = panel.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.querySelector<HTMLElement>('button');
    initial?.focus();
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      anchorRef.current?.focus();
    };
    const handleScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, anchorRef, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={['popover glass motion-pop', className].filter(Boolean).join(' ')}
      role={role}
      aria-label={label}
      data-state={closing ? 'closed' : 'open'}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
