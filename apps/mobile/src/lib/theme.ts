import { Platform } from 'react-native';

/** The website's brand tokens (apps/web/src/app/globals.css), for the native screens. */
export const colors = {
  bg: '#f3f5f8',
  surface: '#ffffff',
  surface2: '#f5f8ff',
  ink: '#0b1120',
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
  star: '#f2a516',
  white: '#ffffff',
};

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
