'use client';

// Keşfet remembers where the customer was, so returning to the map does not ask again.
// Storage can be unavailable (private windows), so every access is guarded.
const KEY = 'salon-randevu-konum';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type LatLng = { lat: number; lng: number };

export function lastLocation(): LatLng | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (saved && Date.now() - saved.at < MAX_AGE_MS) return { lat: saved.lat, lng: saved.lng };
  } catch {
    // No saved location.
  }
  return null;
}

export function rememberLocation(point: LatLng | null) {
  try {
    if (point) window.localStorage.setItem(KEY, JSON.stringify({ ...point, at: Date.now() }));
    else window.localStorage.removeItem(KEY);
  } catch {
    // The location lasts for this page only.
  }
}

/** True only when the browser will answer without showing a permission prompt. */
export async function locationPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}
