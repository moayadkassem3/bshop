import * as SecureStore from 'expo-secure-store';
import { Appearance, Platform } from 'react-native';

/** The website's brand tokens (apps/web/src/app/globals.css), for the native screens. */
const LIGHT = {
  bg: '#f3f5f8',
  surface: '#ffffff',
  surface2: '#f5f8ff',
  /** Text, and the selected chip. */
  ink: '#0b1120',
  /** The navy of headers, the status bar band and other dark panels (the same in both themes). */
  night: '#0b1120',
  ink2: '#3a3f48',
  muted: '#666c78',
  line: '#e1e5eb',
  primary: '#1f48c9',
  primaryHover: '#1a3cab',
  primarySoft: '#e7edfc',
  primaryLight: '#8daeff',
  dark2: '#172033',
  darkMuted: '#9ba4b5',
  success: '#15803d',
  successSoft: '#e5f5ea',
  warning: '#b45309',
  warningSoft: '#fdf0e1',
  danger: '#c62828',
  dangerSoft: '#fdecec',
  dangerLine: '#f2c9c9',
  /** Waiting requests and notices that need attention. */
  warningLine: '#f6d28a',
  /** A favourite salon's heart. */
  heart: '#d1344a',
  heartSoft: '#fdf0f2',
  heartLine: '#f4c7cf',
  star: '#f2a516',
  white: '#ffffff',
  /** The selected chip on light pages. */
  chipOn: '#0b1120',
  /** Buttons floating over photos (back, favourite). */
  float: 'rgba(255,255,255,0.92)',
  /** Dimmed backdrop behind sheets and dialogs. */
  backdrop: 'rgba(11,17,32,0.45)',
};

export type Palette = typeof LIGHT;

/**
 * Dark navy (founder, 8 November 2026): the app follows the phone's light or dark
 * setting unless Profil → Görünüm says otherwise. Same blue accents; cards are a
 * lighter navy than the page; text is soft white.
 */
const DARK: Palette = {
  bg: '#0d1424',
  surface: '#151d30',
  surface2: '#1a2439',
  ink: '#eef1f6',
  night: '#0a0f1d',
  ink2: '#c3cad6',
  muted: '#8f99ab',
  line: '#253149',
  primary: '#3d6ef2',
  primaryHover: '#3462e0',
  primarySoft: '#1b2a52',
  primaryLight: '#8daeff',
  dark2: '#1a2439',
  darkMuted: '#9ba4b5',
  success: '#3cc47c',
  successSoft: '#0f2a1f',
  warning: '#f2b84b',
  warningSoft: '#2d2210',
  danger: '#f07f7f',
  dangerSoft: '#2e1418',
  dangerLine: '#4a2428',
  warningLine: '#5a4416',
  heart: '#f0657a',
  heartSoft: '#2e1620',
  heartLine: '#4a2430',
  star: '#f2b84b',
  white: '#ffffff',
  chipOn: '#3d6ef2',
  float: 'rgba(21,29,48,0.92)',
  backdrop: 'rgba(0,0,0,0.6)',
};

export type Scheme = 'light' | 'dark';
/** Profil → Görünüm: follow the phone (default), or always light / always dark. */
export type ThemePref = 'system' | 'light' | 'dark';
const PREF_KEY = 'theme';

// Read synchronously at start, so the first frame already has the right colours.
let pref: ThemePref = readPref();
let scheme: Scheme = resolve();
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const saved = SecureStore.getItem(PREF_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function resolve(): Scheme {
  if (pref !== 'system') return pref;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function update() {
  const next = resolve();
  if (next === scheme) return;
  scheme = next;
  for (const l of listeners) l();
}

Appearance.addChangeListener(() => {
  if (pref === 'system') update();
});

export const themeScheme = () => scheme;
export const themePref = () => pref;

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    SecureStore.setItem(PREF_KEY, next);
  } catch {
    // Not saved: it still applies until the app closes.
  }
  update();
  for (const l of listeners) l();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The colours of the theme in use; read when drawing, so a theme change shows after a redraw. */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_, key: string) => (scheme === 'dark' ? DARK : LIGHT)[key as keyof Palette],
});

/** A style sheet built for each theme (once) and read from the one in use. */
export function themed<T extends object>(factory: () => T): T {
  const built: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get: (_, key) => ((built[scheme] ??= factory()) as Record<string | symbol, unknown>)[key],
  });
}

/** Inter, loaded in the root layout; weights map to separate font files on Android. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
};

export const radius = { sm: 14, md: 20, pill: 999 };

export const shadow = Platform.select({
  // No elevation on Android: while a page fades in, Android draws elevation shadows as solid grey
  // boxes behind the cards (founder's screen recording, 4 November 2026). Cards keep their border.
  android: {},
  default: { shadowColor: '#0b1120', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
});
