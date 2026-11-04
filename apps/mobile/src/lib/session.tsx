import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, configureApi, currentToken } from './api';
import type { Me, Portal } from './types';

const TOKEN_KEY = 'session-token';
const LAST_MODE_KEY = 'last-mode';
const ME_KEY = 'me-cache';

/**
 * The mode used last on this phone (as the website's lastMode): kept after
 * signing out, so someone who works at a salon but last used the app as a
 * customer is not put back into business mode at the next sign-in.
 */
export async function lastMode(): Promise<'customer' | 'business' | null> {
  const mode = await SecureStore.getItemAsync(LAST_MODE_KEY).catch(() => null);
  return mode === 'customer' || mode === 'business' ? mode : null;
}

type Session = {
  /** null until the stored session has been read. */
  ready: boolean;
  me: Me | null;
  /** Business mode: Salonum, Talepler, Geçmiş. Customers get Keşfet, Randevularım, Favoriler. */
  business: boolean;
  /** hasBusiness: from the sign-in answer, in case /me cannot be read straight away. */
  signIn: (token: string, me: Me, hasBusiness?: boolean) => Promise<void>;
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

  /**
   * /me for the session in use now. An answer that arrives after the session changed
   * (a mode switch while a slow refresh was on its way) is dropped: kept, it would put
   * business screens on a customer session, which the server refuses (FORBIDDEN).
   */
  const fetchMe = useCallback(async (): Promise<Me | null> => {
    const sentWith = currentToken();
    const fresh = await api<Me>('/me');
    return currentToken() === sentWith ? fresh : null;
  }, []);
  const applyMe = useCallback((fresh: Me | null) => {
    if (fresh) setMe(fresh);
  }, []);

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
        // Open at once with the account saved last time and refresh it in the background,
        // instead of holding the splash screen until the server answers (founder: 4.2 s).
        const saved = await SecureStore.getItemAsync(ME_KEY).catch(() => null);
        const cached = saved ? (JSON.parse(saved) as Me) : null;
        if (cached) {
          setMe(cached);
          setReady(true);
          fetchMe()
            .then(applyMe)
            .catch(() => undefined);
          return;
        }
        try {
          applyMe(await fetchMe());
        } catch {
          // Offline: keep the token; screens show their own errors and retry.
        }
      }
      setReady(true);
    })();
  }, [clear, fetchMe, applyMe]);

  // The account is saved on the phone for the next start (and forgotten on sign-out).
  useEffect(() => {
    if (!ready) return;
    if (me) SecureStore.setItemAsync(ME_KEY, JSON.stringify(me)).catch(() => undefined);
    else SecureStore.deleteItemAsync(ME_KEY).catch(() => undefined);
  }, [me, ready]);

  const signIn = useCallback(
    async (token: string, next: Me, hasBusiness?: boolean) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      if (next.portal) await SecureStore.setItemAsync(LAST_MODE_KEY, next.portal === 'customer' ? 'customer' : 'business').catch(() => undefined);
      configureApi({ token });
      setMe((await fetchMe().catch(() => null)) ?? { ...next, has_business: next.has_business ?? hasBusiness });
    },
    [fetchMe],
  );

  // Coming back to the app re-reads the account, so a number just added to a salon's
  // team (or a salon just registered on the website) shows business mode without signing out.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && me)
        fetchMe()
          .then(applyMe)
          .catch(() => undefined);
    });
    return () => sub.remove();
  }, [me, fetchMe, applyMe]);

  const signOut = useCallback(async () => {
    // The session ends on the server too (security, v1.7).
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clear();
  }, [clear]);

  const switchMode = useCallback(
    async (to: 'customer' | 'business') => {
      const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to } });
      await signIn(r.token, r.user, true);
    },
    [signIn],
  );

  const refresh = useCallback(async () => {
    applyMe(await fetchMe());
  }, [fetchMe, applyMe]);

  const value = useMemo<Session>(() => ({ ready, me, business: isBusiness(me?.portal), signIn, signOut, switchMode, refresh }), [ready, me, signIn, signOut, switchMode, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const isBusiness = (portal?: Portal) => portal === 'owner' || portal === 'staff';

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
