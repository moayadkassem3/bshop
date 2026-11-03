import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Loads while the screen is open and again every `everyMs` (new requests arrive
 * without pulling to refresh). Returns a refresh for pull-to-refresh.
 */
export function usePolling(load: () => Promise<unknown>, everyMs = 15_000) {
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, everyMs);
      return () => clearInterval(timer);
    }, [load, everyMs]),
  );
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }, [load]);
  return { refreshing, refresh };
}
