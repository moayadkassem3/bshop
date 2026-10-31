'use client';

import { api } from './api';
import { getToken } from './session';
import type { MyShop, ShopSummary } from './types';

// Favourites live in the customer's account once they sign in. Before that they
// are kept on this phone, and moved into the account at sign-in.
const KEY = 'salon-randevu-favorites';
const CHANGED = 'salon-randevu-favorites-changed';

function readLocal(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(slugs: string[]) {
  try {
    if (slugs.length) window.localStorage.setItem(KEY, JSON.stringify(slugs.slice(0, 30)));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage, favourites last for this page only.
  }
}

/** Favourites first, then shops booked before (only when signed in). */
export async function loadMyShops(): Promise<MyShop[]> {
  if (getToken()) return api<MyShop[]>('/me/shops');
  const slugs = readLocal();
  if (!slugs.length) return [];
  const shops = await api<Omit<ShopSummary, 'address'>[]>(`/public/shop-summaries?slugs=${slugs.map(encodeURIComponent).join(',')}`);
  return shops.map((s) => ({ ...s, favorite: true, last_visit: null }));
}

export async function isFavorite(slug: string): Promise<boolean> {
  if (!getToken()) return readLocal().includes(slug);
  const shops = await api<MyShop[]>('/me/shops');
  return shops.some((s) => s.slug === slug && s.favorite);
}

export async function setFavorite(slug: string, on: boolean) {
  if (getToken()) {
    await api(`/me/favorites/${encodeURIComponent(slug)}`, { method: on ? 'PUT' : 'DELETE' });
  } else {
    const current = readLocal().filter((s) => s !== slug);
    writeLocal(on ? [slug, ...current] : current);
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Called right after sign-in: favourites saved on this phone move to the account. */
export async function moveLocalFavoritesToAccount() {
  const slugs = readLocal();
  for (const slug of [...slugs].reverse()) {
    await api(`/me/favorites/${encodeURIComponent(slug)}`, { method: 'PUT' }).catch(() => undefined);
  }
  writeLocal([]);
  if (slugs.length) window.dispatchEvent(new Event(CHANGED));
}

export function onFavoritesChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
