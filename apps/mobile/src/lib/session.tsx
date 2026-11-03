import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, configureApi } from './api';
import type { Me, Portal } from './types';

const TOKEN_KEY = 'session-token';

type Session = {
  /** null until the stored session has been read. */
  ready: boolean;
  me: Me | null;
  /** Business mode: Salonum, Talepler, Geçmiş. Customers get Keşfet, Randevularım, Favoriler. */
  business: boolean;
  signIn: (token: string, me: Me) => Promise<void>;
  signOut: () => Promise<void>;
  switchMode: (to: 'customer' | 'business') => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/**
 * The signed-in account (v1.7, native app): the same phone sign-in and sessions
 * as the website, with the token kept in the phone's secure storage.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const clear = useCallback(async () => {
    configureApi({ token: null });
    setMe(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      configureApi({ token, onUnauthorized: () => void clear() });
      if (token) {
        try {
          setMe(await api<Me>('/me'));
        } catch {
          // Offline: keep the token; screens show their own errors and retry.
        }
      }
      setReady(true);
    })();
  }, [clear]);

  const signIn = useCallback(async (token: string, next: Me) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    configureApi({ token });
    setMe(await api<Me>('/me').catch(() => next));
  }, []);

  const signOut = useCallback(async () => {
    // The session ends on the server too (security, v1.7).
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clear();
  }, [clear]);

  const switchMode = useCallback(
    async (to: 'customer' | 'business') => {
      const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to } });
      await signIn(r.token, r.user);
    },
    [signIn],
  );

  const refresh = useCallback(async () => {
    setMe(await api<Me>('/me'));
  }, []);

  const value = useMemo<Session>(
    () => ({ ready, me, business: isBusiness(me?.portal), signIn, signOut, switchMode, refresh }),
    [ready, me, signIn, signOut, switchMode, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const isBusiness = (portal?: Portal) => portal === 'owner' || portal === 'staff';

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
