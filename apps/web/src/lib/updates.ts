'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { getToken } from './session';

/**
 * What the salon did to a customer's appointment (v1.7): the same messages the
 * customer gets by SMS. Randevular shows a red count until it is opened.
 */
const SALON_UPDATES = new Set([
  'confirmed',
  'declined',
  'cancelledByShop',
  'cancelled_staff_absence',
  'reassigned_info',
  'reassigned_choice',
  'time_offered',
]);

const SEEN_KEY = 'salon-randevu-randevular-goruldu';
const SEEN_EVENT = 'salon-randevu-randevular';

export function updatesSeenAt(): string {
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

export function markUpdatesSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to remember.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** Appointments the salon changed since `after`, newest first. */
export async function appointmentUpdates(after: string): Promise<string[]> {
  const items = await api<{ template: string; appointment_id: string | null }[]>(`/me/notifications?after=${encodeURIComponent(after)}`);
  const ids = items.filter((n) => n.appointment_id && SALON_UPDATES.has(n.template)).map((n) => n.appointment_id!);
  return [...new Set(ids)];
}

/** For the Randevular tab: appointments the salon changed since it was last opened; checked every minute. */
export function useAppointmentUpdates(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return setCount(0);
    let stopped = false;
    // Signed-out visitors have nothing to check; signing in is picked up on the next round.
    const check = () =>
      getToken()
        ? appointmentUpdates(updatesSeenAt())
            .then((ids) => !stopped && setCount(ids.length))
            .catch(() => undefined)
        : setCount(0);
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
