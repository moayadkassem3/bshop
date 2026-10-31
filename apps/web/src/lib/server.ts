import { SERVER_API_URL } from './config';
import type { ShopProfile } from './types';

/** Public shop profile for server-rendered pages; null when the shop is not public. */
export async function loadProfile(slug: string): Promise<ShopProfile | null> {
  const res = await fetch(`${SERVER_API_URL}/public/shops/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shop profile failed: ${res.status}`);
  return res.json();
}

export type ListingShop = {
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  city: string | null;
  audience: 'men' | 'women' | 'unisex';
  verified: boolean;
  cover_photo_id: string | null;
};

/** Public salons for a listing page (v1.7). */
export async function loadListing(q: { city: string; district?: string; audience?: 'men' | 'women' }): Promise<ListingShop[]> {
  const params = new URLSearchParams({ city: q.city, ...(q.district ? { district: q.district } : {}), ...(q.audience ? { audience: q.audience } : {}) });
  const res = await fetch(`${SERVER_API_URL}/public/listing?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Listing failed: ${res.status}`);
  return res.json();
}

/** A province's districts that have salons, with counts by type. */
export async function loadDistricts(city: string): Promise<{ district: string; total: number; men: number; women: number }[]> {
  const res = await fetch(`${SERVER_API_URL}/public/listing/districts?city=${encodeURIComponent(city)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Districts failed: ${res.status}`);
  return res.json();
}

/** Every public salon, for the sitemap. */
export async function loadSitemap(): Promise<{ slug: string; city: string | null; district: string | null; audience: 'men' | 'women' | 'unisex' }[]> {
  const res = await fetch(`${SERVER_API_URL}/public/sitemap`, { cache: 'no-store' });
  return res.ok ? res.json() : [];
}
