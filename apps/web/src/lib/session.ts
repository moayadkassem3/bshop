'use client';

import { useEffect, useState } from 'react';

// The sign-in token for this browser, and which mode it is in (customer or
// business). Storage can be unavailable (private windows, blocked site data),
// so every access is guarded.
const KEY = 'salon-randevu-token';
const PORTAL_KEY = 'salon-randevu-mod';
const CHANGE = 'salon-randevu-oturum';

export type Portal = 'customer' | 'staff' | 'owner';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Saves the session; pass the portal from the sign-in or mode-switch response. */
export function setToken(token: string | null, portal?: Portal) {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
    if (token && portal) window.localStorage.setItem(PORTAL_KEY, portal);
    if (!token) window.localStorage.removeItem(PORTAL_KEY);
  } catch {
    // Without storage the customer stays signed in for this page only.
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** Records the mode when it is learned from /me (sessions saved before modes were stored). */
export function rememberPortal(portal: Portal | undefined) {
  if (!portal) return;
  try {
    if (window.localStorage.getItem(PORTAL_KEY) === portal) return;
    window.localStorage.setItem(PORTAL_KEY, portal);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE));
}

function storedPortal(): Portal | null {
  try {
    return getToken() ? ((window.localStorage.getItem(PORTAL_KEY) as Portal | null) ?? null) : null;
  } catch {
    return null;
  }
}

/** True while this browser is signed in to a business (owner or staff). */
export function useBusinessMode(): boolean {
  const [portal, setPortal] = useState<Portal | null>(null);
  useEffect(() => {
    const read = () => setPortal(storedPortal());
    read();
    window.addEventListener(CHANGE, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(CHANGE, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return portal === 'owner' || portal === 'staff';
}
