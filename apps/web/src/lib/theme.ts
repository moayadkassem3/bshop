'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY } from './themeBoot';

/**
 * Light or dark (founder, 8 November 2026): Profil → Görünüm. The website starts
 * light; Koyu is the app's navy, Otomatik follows the device. Kept in this browser.
 */
export type ThemePref = 'light' | 'dark' | 'system';

export function readThemePref(): ThemePref {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'system' ? t : 'light';
  } catch {
    return 'light';
  }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Whether the page is drawn dark now. */
export const isDark = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

export function useThemePref(): [ThemePref, (next: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>('light');
  useEffect(() => setPref(readThemePref()), []);

  // Otomatik follows the device when it switches between light and dark.
  useEffect(() => {
    if (pref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  const choose = useCallback((next: ThemePref) => {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not saved: it still applies on this page.
    }
    apply(next);
    setPref(next);
  }, []);

  return [pref, choose];
}

/** The map for the theme in use: OpenFreeMap's Liberty, or the same map in navy (scripts/build-navy-map-style.mjs). */
export const mapStyleUrl = () => (isDark() ? '/map/lacivert.json' : 'https://tiles.openfreemap.org/styles/liberty');
