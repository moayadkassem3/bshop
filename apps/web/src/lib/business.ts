'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from './api';

export type BusinessShop = {
  id: string;
  name: string;
  slug: string;
  member_id: string;
  role: 'owner' | 'staff';
  reviewed_at: string | null;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  city: string | null;
  audience: 'men' | 'women' | 'unisex';
  cover_photo_id: string | null;
  subscription_status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
  /** Bookable staff, which sets the plan; plan_id is null above 10 (priced individually). */
  seats: number;
  plan_id: string | null;
};

/** Whole days left until the end of the trial or period, counting today; 0 once it has passed. */
export function daysLeft(end: string | null): number {
  return end ? Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000)) : 0;
}

export type ShopAppointment = {
  id: string;
  staff_id: string;
  staff_name: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';
  source: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_phone: string | null;
  guest_name: string | null;
  requested_staff: boolean;
  deadline_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  total_price_kurus: number;
  price_is_starting_from: boolean;
  no_show_count: number | null;
  late_cancel_count: number | null;
  services: { name: string; durationMinutes: number }[] | null;
};

const SHOP_KEY = 'salon-randevu-isletme';

/** Opens business pages on this shop (e.g. from its card in Profil). */
export function rememberShop(id: string) {
  try {
    window.localStorage.setItem(SHOP_KEY, id);
  } catch {
    // The choice lasts for this page only.
  }
}

/** The shops this person works in, and the one they are looking at (remembered per browser). */
export function useBusinessShops(enabled = true) {
  const [shops, setShops] = useState<BusinessShop[] | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    api<BusinessShop[]>('/staff/shops')
      .then((list) => {
        setShops(list);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(SHOP_KEY);
        } catch {
          // Without storage the first shop is shown.
        }
        setShopId(list.find((s) => s.id === saved)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [enabled]);

  function selectShop(id: string) {
    setShopId(id);
    rememberShop(id);
  }

  return { shops, shop: shops?.find((s) => s.id === shopId) ?? null, shopId, selectShop, error };
}

// The Geçmiş tab shows a count of cancellations that arrived since it was last opened.
const SEEN_KEY = 'salon-randevu-gecmis-goruldu';
const SEEN_EVENT = 'salon-randevu-gecmis';

export function historySeenAt(): string {
  try {
    const seen = window.localStorage.getItem(SEEN_KEY);
    if (seen) return seen;
    const now = new Date().toISOString();
    window.localStorage.setItem(SEEN_KEY, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

export function markHistorySeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to remember.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** New customer cancellations since Geçmiş was last opened; checked every minute. */
export function useNewCancellations(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return setCount(0);
    let stopped = false;
    const check = () =>
      api<{ template: string }[]>(`/me/notifications?after=${encodeURIComponent(historySeenAt())}`)
        .then((items) => !stopped && setCount(items.filter((n) => n.template === 'customer_cancelled').length))
        .catch(() => undefined);
    check();
    const timer = setInterval(check, 60_000);
    const reset = () => setCount(0);
    window.addEventListener(SEEN_EVENT, reset);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener(SEEN_EVENT, reset);
    };
  }, [enabled]);
  return count;
}
