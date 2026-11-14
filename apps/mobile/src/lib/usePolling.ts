import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { onPushReceived } from './push';

/**
 * Loads while the screen is open and again every `everyMs` (new requests arrive
 * without pulling to refresh), and at once when a push notification arrives.
 * Returns a refresh for pull-to-refresh.
 */
export function usePolling(load: () => Promise<unknown>, everyMs = 15_000) {
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, everyMs);
      const off = onPushReceived(() => void load());
      return () => {
        clearInterval(timer);
        off();
      };
    }, [load, everyMs]),
  );
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }, [load]);
  return { refreshing, refresh };
}
