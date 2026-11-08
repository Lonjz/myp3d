import { Fragment } from 'react';

const MOD = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

const SHORTCUTS: Array<[string[][], string]> = [
  [[[MOD, 'K'], ['/']], 'Search'],
  [[['Tab']], 'Actions for a search result'],
  [[['Shift', 'Enter']], 'Quick action for a search result'],
  [[['Space']], 'Play or pause'],
  [[[MOD, 'S']], 'Save changes'],
  [[['?']], 'Shortcuts'],
];

export function ShortcutsSection() {
  return (
    <dl className="shortcuts-list">
      {SHORTCUTS.map(([combos, action]) => (
        <div key={action} className="shortcuts-list__row">
          <dt>
            {combos.map((keys, index) => (
              <Fragment key={keys.join('+')}>
                {index > 0 && <span className="shortcuts-list__or">or</span>}
                {keys.map((key) => (
                  <kbd key={key} className="shortcuts-list__key">{key}</kbd>
                ))}
              </Fragment>
            ))}
          </dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}
