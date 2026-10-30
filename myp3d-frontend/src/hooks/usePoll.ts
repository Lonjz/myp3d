import { useEffect, useEffectEvent } from 'react';

export function usePoll(poll: () => Promise<unknown>, intervalMs: number, active = true) {
  const tick = useEffectEvent(poll);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let timer: number | undefined;

    const run = async () => {
      await tick().catch(() => undefined);
      if (!stopped) timer = window.setTimeout(run, intervalMs);
    };

    timer = window.setTimeout(run, intervalMs);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [active, intervalMs]);
}
