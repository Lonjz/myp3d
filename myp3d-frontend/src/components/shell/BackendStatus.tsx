import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { API_BASE, UNREACHABLE_MESSAGE } from '../../api/mp3Api';
import { usePresence } from '../../hooks/usePresence';
import { emitAppEvent, subscribeAppEvent } from '../../utils/appEvents';

const FIRST_CHECK_MS = 1000;
const LONGEST_CHECK_MS = 10000;

export function BackendStatus() {
  const [down, setDown] = useState(false);
  const presence = usePresence(down);

  useEffect(() => subscribeAppEvent('backend-unreachable', () => setDown(true)), []);

  useEffect(() => {
    if (!down) return undefined;
    let delay = FIRST_CHECK_MS;
    let timer: number | undefined;

    const check = async () => {
      try {
        if ((await fetch(`${API_BASE}/`)).ok) {
          setDown(false);
          emitAppEvent('library-changed');
          emitAppEvent('playlists-changed');
          emitAppEvent('favorites-changed');
          emitAppEvent('queue-changed');
          return;
        }
      } catch {
        delay = Math.min(delay * 2, LONGEST_CHECK_MS);
      }
      timer = window.setTimeout(check, delay);
    };

    timer = window.setTimeout(check, delay);
    return () => window.clearTimeout(timer);
  }, [down]);

  if (!presence.mounted) return null;

  return (
    <div
      className="backend-banner glass motion-pop"
      role="alert"
      title={UNREACHABLE_MESSAGE}
      data-state={presence.closing ? 'closed' : 'open'}
    >
      <WifiOff aria-hidden="true" />
      <span>Offline</span>
    </div>
  );
}
