'use client';

// The customer's sign-in token for this browser. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
const KEY = 'salon-randevu-token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the customer stays signed in for this page only.
  }
}
