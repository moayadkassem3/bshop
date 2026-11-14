import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Line icons on a 24-unit grid with a 1.8 stroke: the same drawings as the website (apps/web/src/components/Icon.tsx); keep the two in step. */
const ICONS = {
  salonum: (
    <>
      <Path d="M3.5 9.5 5 4.5h14l1.5 5" />
      <Path d="M3.5 9.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5" />
      <Path d="M5 12v8h14v-8M10 20v-4.5h4V20" />
    </>
  ),
  kesfet: <Path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" />,
  randevular: (
    <>
      <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  favoriler: <Path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.7 3.1 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />,
  gecmis: (
    <>
      <Path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <Path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
    </>
  ),
  profil: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="m16 16 4 4" />
    </>
  ),
  back: <Path d="M15 5l-7 7 7 7" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  // The website's calendar for empty lists (with the day dots).
  calendarDots: (
    <>
      <Rect x="3" y="5" width="18" height="16" rx="2.5" />
      <Path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </>
  ),
  close: <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <Circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  phone: <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  clock: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  locate: (
    <>
      <Circle cx="12" cy="12" r="7" />
      <Circle cx="12" cy="12" r="2.5" />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  card: (
    <>
      <Rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <Path d="M3 10h18M7 15h4" />
    </>
  ),
  share: <Path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  edit: <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  doc: (
    <>
      <Path d="M6 3.5h8l4 4v13H6z" />
      <Path d="M14 3.5v4h4M9 12h6M9 16h6" />
    </>
  ),
  camera: (
    <>
      <Path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <Circle cx="12" cy="13" r="3.5" />
    </>
  ),
  map: <Path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" />,
  qr: (
    <>
      <Rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <Rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <Rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" />
      <Path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h2M20.5 14v2" />
    </>
  ),
  chart: <Path d="M4 20h16M7.5 17v-6M12 17V5M16.5 17V9" />,
  settings: (
    <>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <Circle cx="15" cy="7" r="2" />
      <Circle cx="9" cy="17" r="2" />
    </>
  ),
  swap: <Path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  trash: <Path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  gallery: (
    <>
      <Rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <Circle cx="9" cy="10" r="1.8" />
      <Path d="M20.5 16l-5-5-8.5 8.5" />
    </>
  ),
  // Profil → Görünüm: light, dark, and follow the device (a half-filled circle).
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <Path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />,
  auto: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </>
  ),
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} color={color} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}
