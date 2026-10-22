import type { KeyboardEvent, MouseEvent } from 'react';

const INTERACTIVE_SELECTOR = 'button, a, input, label, select, textarea, [data-no-row-open]';

export function rowOpenProps<E extends HTMLElement>(open: () => void) {
  return {
    tabIndex: 0,
    onClick: (event: MouseEvent<E>) => {
      if ((event.target as Element).closest(INTERACTIVE_SELECTOR)) return;
      open();
    },
    onKeyDown: (event: KeyboardEvent<E>) => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      open();
    },
  };
}
