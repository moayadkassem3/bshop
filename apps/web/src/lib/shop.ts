import type { OpeningHours, ShopProfile } from './types';

/** Shop photos are served by the backend through the /api rewrite. */
export const photoUrl = (id: string) => `/api/public/photos/${id}`;
export const haircutPhotoUrl = (id: string) => `/api/public/haircut-photos/${id}`;

/** Opens turn-by-turn directions in the phone's maps app (Google Maps link works on Android and iPhone). */
export function directionsUrl(shop: Pick<ShopProfile, 'latitude' | 'longitude' | 'address' | 'name'>): string | null {
  if (shop.latitude !== null && shop.longitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`;
  }
  if (shop.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${shop.name}, ${shop.address}`)}`;
  return null;
}

/** "Kadıköy, İstanbul", or whichever part is known. */
export function placeLabel(shop: { district: string | null; city: string | null }): string | null {
  return [shop.district, shop.city].filter(Boolean).join(', ') || null;
}

export const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/** +905320000001 → 0532 000 00 01 */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export const AUDIENCE: Record<ShopProfile['audience'], string> = {
  men: 'Erkek kuaförü',
  women: 'Kadın kuaförü',
  unisex: 'Kadın & erkek kuaförü',
};

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** ISO weekday (1 = Monday) in Türkiye right now. */
export function turkeyWeekday(now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

export function todayHours(hours: OpeningHours[], now = new Date()): OpeningHours | undefined {
  return hours.find((h) => h.weekday === turkeyWeekday(now));
}

/** "850 m" or "2,3 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`;
}

/** Straight-line distance in metres between two points. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
