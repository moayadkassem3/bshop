'use client';

import { useEffect, useState } from 'react';

/**
 * Store apps (iOS and Android) never sell (founder, v1.7). Apple's rule 3.1.3(f)
 * and Google Play's payments policy let a free app use an account bought on the
 * website only if the app has no buy button, no prices and no "subscribe on our
 * website" link or wording. Payment happens on the website (/abonelik), and
 * owners are pointed there by SMS from the server, outside the app.
 *
 * Every price, "Aboneliği başlat", "Kartla öde", "Teklif al" and Paketler link
 * goes through useCanSell(). Inside the apps it is false; on the website true.
 */

const PREVIEW_KEY = 'salon-randevu-magaza-onizleme';

/** True inside the store apps: the Capacitor shell marks itself native. */
export function isStoreApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  // Preview on the website what the apps will show: open any page with ?magaza=1 (?magaza=0 ends it).
  try {
    const flag = new URLSearchParams(window.location.search).get('magaza');
    if (flag === '1') window.sessionStorage.setItem(PREVIEW_KEY, '1');
    if (flag === '0') window.sessionStorage.removeItem(PREVIEW_KEY);
    return window.sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether this screen may show prices and ways to pay. null until known, so
 * selling UI never flashes inside the apps: render it only when this is true.
 */
export function useCanSell(): boolean | null {
  const [canSell, setCanSell] = useState<boolean | null>(null);
  useEffect(() => setCanSell(!isStoreApp()), []);
  return canSell;
}
