import type { Deps } from '../deps.js';
import { badRequest } from '../errors.js';
import { candidateStarts } from '../domain/availability.js';
import { inAutoConfirmHours, type WeeklyWindow } from '../domain/confirmation.js';
import { localDay, localDayOf } from '../domain/time.js';
import { listPhotos } from './photos.js';
import { getPublicShopBySlug } from './shops.js';
import { earliestStart, eligibleStaff, loadDaySchedules, loadServices } from './schedule.js';

export type Slot = {
  startsAt: string;
  /** Shows the "Anında onay" badge: this start falls in the shop's automatic-confirmation hours. */
  instantConfirmation: boolean;
  staff: { id: string; durationMinutes: number }[];
};

export async function getAvailability(
  deps: Deps,
  slug: string,
  input: { date: string; serviceIds: string[]; staffId?: string | null },
) {
  const now = deps.clock.now();
  const shop = await getPublicShopBySlug(deps.db, now, slug);
  const services = await loadServices(deps.db, shop.id, input.serviceIds);
  let staff = await eligibleStaff(deps.db, shop.id, input.serviceIds);
  if (input.staffId) {
    staff = staff.filter((s) => s.id === input.staffId);
    if (staff.length === 0) throw badRequest('STAFF_NOT_ELIGIBLE', 'This staff member does not offer these services');
  }

  const day = localDay(input.date, shop.timezone);
  const today = localDayOf(now, shop.timezone);
  const lastDay = localDayOf(new Date(now.getTime() + shop.booking_horizon_days * 86_400_000), shop.timezone);
  const totals = {
    totalPriceKurus: services.reduce((sum, s) => sum + s.price_kurus, 0),
    priceIsStartingFrom: services.some((s) => s.price_is_starting_from),
  };
  if (day.start < today.start || day.start > lastDay.start || staff.length === 0) {
    return { date: input.date, ...totals, slots: [] as Slot[] };
  }

  const schedules = await loadDaySchedules(deps.db, day, staff.map((s) => s.id));
  const windows = (
    await deps.db.query<WeeklyWindow>('SELECT weekday, start_minute, end_minute FROM auto_confirm_hours WHERE shop_id = $1', [
      shop.id,
    ])
  ).rows;
  const earliest = earliestStart(shop, now);

  const byStart = new Map<number, Slot['staff']>();
  for (const member of staff) {
    const schedule = schedules.get(member.id)!;
    const starts = candidateStarts({
      ...schedule,
      durationMinutes: member.durationMinutes,
      bufferMinutes: shop.buffer_minutes,
      stepMinutes: shop.slot_step_minutes,
      dayStart: day.start.toMillis(),
      earliest,
    });
    for (const t of starts) {
      const list = byStart.get(t) ?? [];
      list.push({ id: member.id, durationMinutes: member.durationMinutes });
      byStart.set(t, list);
    }
  }

  const slots: Slot[] = [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, members]) => ({
      startsAt: new Date(t).toISOString(),
      instantConfirmation: inAutoConfirmHours(new Date(t), shop.timezone, windows),
      staff: members,
    }));
  return { date: input.date, ...totals, slots };
}

/** "İlk uygun saat": the first free start from today onwards, within the booking horizon. */
export async function firstAvailable(deps: Deps, slug: string, input: { serviceIds: string[]; staffId?: string | null }) {
  const now = deps.clock.now();
  const shop = await getPublicShopBySlug(deps.db, now, slug);
  const today = localDayOf(now, shop.timezone);
  for (let i = 0; i <= shop.booking_horizon_days; i++) {
    const date = today.start.plus({ days: i }).toISODate()!;
    const result = await getAvailability(deps, slug, { ...input, date });
    if (result.slots.length) return { date, slot: result.slots[0]! };
  }
  return null;
}

/** Public shop profile: services with prices, bookable staff and what they offer, and the cancellation rule. */
export async function getShopProfile(deps: Deps, slug: string) {
  const shop = await getPublicShopBySlug(deps.db, deps.clock.now(), slug);
  const services = await deps.db.query(
    `SELECT id, name, duration_minutes, price_kurus, price_is_starting_from FROM services
     WHERE shop_id = $1 AND active ORDER BY sort_order, name`,
    [shop.id],
  );
  const staff = await deps.db.query(
    `SELECT m.id, m.display_name, COALESCE(array_agg(ms.service_id) FILTER (WHERE ms.service_id IS NOT NULL), '{}') AS service_ids
     FROM shop_members m LEFT JOIN member_services ms ON ms.member_id = m.id
     WHERE m.shop_id = $1 AND m.active AND m.bookable
     GROUP BY m.id ORDER BY m.display_name`,
    [shop.id],
  );
  // Shop hours = from the earliest start to the latest end of anyone bookable that weekday.
  const hours = await deps.db.query<{ weekday: number; open: number; close: number }>(
    `SELECT w.weekday, min(w.start_minute)::int AS open, max(w.end_minute)::int AS close
     FROM working_hours w JOIN shop_members m ON m.id = w.member_id
     WHERE w.shop_id = $1 AND m.active AND m.bookable
     GROUP BY w.weekday`,
    [shop.id],
  );
  const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const openingHours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const h = hours.rows.find((r) => r.weekday === weekday);
    return h ? { weekday, open: hhmm(h.open), close: hhmm(h.close) } : { weekday, open: null, close: null };
  });

  return {
    slug: shop.slug,
    name: shop.name,
    about: shop.about,
    address: shop.address,
    district: shop.district,
    city: shop.city,
    phone: shop.phone,
    whatsapp: shop.whatsapp,
    instagram: shop.instagram,
    latitude: shop.latitude,
    longitude: shop.longitude,
    audience: shop.audience,
    cancellationCutoffMinutes: shop.cancellation_cutoff_minutes,
    paymentAtShop: true,
    photos: await listPhotos(deps, shop.id),
    openingHours,
    services: services.rows,
    staff: staff.rows,
  };
}
