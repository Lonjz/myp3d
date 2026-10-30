import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => !item.hidden);

export function useDialog(
  ref: RefObject<HTMLElement | null>,
  { onClose, locked = false, initialFocus }: { onClose: () => void; locked?: boolean; initialFocus?: RefObject<HTMLElement | null> },
) {
  const close = useEffectEvent(onClose);
  const focusInitial = useEffectEvent(() => {
    const node = ref.current;
    if (!node || node.contains(document.activeElement)) return;
    (initialFocus?.current ?? focusables(node)[0] ?? node).focus();
  });

  useEffect(() => {
    if (locked) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [locked]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusInitial();

    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables(node);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', trap);
    return () => {
      node.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [ref]);
}
