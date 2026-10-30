import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { usePresence } from '../../hooks/usePresence';
import { subscribeAppEvent } from '../../utils/appEvents';
import { Modal } from '../ui/Modal';

const MOD = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

const SHORTCUTS: Array<[string[], string]> = [
  [[MOD, 'K'], 'Search'],
  [['/'], 'Search'],
  [['Tab'], 'Actions for a search result'],
  [['Shift', 'Enter'], 'Quick action for a search result'],
  [['Space'], 'Play or pause'],
  [[MOD, 'S'], 'Save changes'],
  [['?'], 'Shortcuts'],
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const { mounted, closing } = usePresence(open);

  useEffect(() => subscribeAppEvent('show-shortcuts', () => setOpen(true)), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!mounted) return null;

  return (
    <Modal className="shortcuts-dialog" closing={closing} onClose={() => setOpen(false)} label="Keyboard shortcuts">
      <Keyboard className="shortcuts-dialog__icon" aria-hidden="true" />
      <dl className="shortcuts-list">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={action + keys.join('+')} className="shortcuts-list__row">
            <dt>
              {keys.map((key) => (
                <kbd key={key} className="shortcuts-list__key">{key}</kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
