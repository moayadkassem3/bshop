import type { Deps } from './deps.js';
import { dispatchNotifications } from './notifications.js';
import { runTimers } from './services/timers.js';

/** One worker pass: due reminders and automatic confirmations, then outgoing messages. */
export async function tick(deps: Deps) {
  const timers = await runTimers(deps);
  const sent = await dispatchNotifications(deps);
  return { ...timers, sent };
}

export function startWorker(deps: Deps, onError: (err: unknown) => void): () => void {
  let running = false;
  const handle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick(deps);
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  }, deps.config.tickSeconds * 1000);
  return () => clearInterval(handle);
}
