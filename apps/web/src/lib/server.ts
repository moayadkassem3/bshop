import { SERVER_API_URL } from './config';
import type { ShopProfile } from './types';

/** Public shop profile for server-rendered pages; null when the shop is not public. */
export async function loadProfile(slug: string): Promise<ShopProfile | null> {
  const res = await fetch(`${SERVER_API_URL}/public/shops/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shop profile failed: ${res.status}`);
  return res.json();
}
