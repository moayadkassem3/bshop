import type { Queryable } from '../db.js';
import { badRequest } from '../errors.js';
import type { Interval } from '../domain/availability.js';
import { atMinute, ceilToMinutes, MINUTE, type LocalDay } from '../domain/time.js';
import type { Shop } from './shops.js';

export type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_kurus: number;
  price_is_starting_from: boolean;
};

/** Active services of the shop, in the requested order; 400 if any is unknown. */
export async function loadServices(q: Queryable, shopId: string, serviceIds: string[]): Promise<ServiceRow[]> {
  if (serviceIds.length === 0) throw badRequest('NO_SERVICES', 'Select at least one service');
  if (new Set(serviceIds).size !== serviceIds.length) throw badRequest('DUPLICATE_SERVICE');
  const { rows } = await q.query<ServiceRow>(
    `SELECT id, name, duration_minutes, price_kurus, price_is_starting_from
     FROM services WHERE shop_id = $1 AND active AND id = ANY($2::uuid[])`,
    [shopId, serviceIds],
  );
  if (rows.length !== serviceIds.length) throw badRequest('UNKNOWN_SERVICE', 'A selected service is not available');
  return serviceIds.map((id) => rows.find((r) => r.id === id)!);
}

export type EligibleStaff = { id: string; displayName: string; durationMinutes: number };

/**
 * Bookable staff who perform ALL the services, with their combined duration
 * (their own duration where set, otherwise the shop default).
 */
export async function eligibleStaff(q: Queryable, shopId: string, serviceIds: string[]): Promise<EligibleStaff[]> {
  const { rows } = await q.query<{ id: string; display_name: string; duration: number }>(
    `SELECT m.id, m.display_name, sum(COALESCE(ms.duration_minutes, s.duration_minutes))::int AS duration
     FROM shop_members m
     JOIN member_services ms ON ms.member_id = m.id
     JOIN services s ON s.id = ms.service_id AND s.active
     WHERE m.shop_id = $1 AND m.active AND m.bookable AND s.id = ANY($2::uuid[])
     GROUP BY m.id, m.display_name
     HAVING count(*) = $3
     ORDER BY m.display_name COLLATE "tr-x-icu", m.id`,
    [shopId, serviceIds, serviceIds.length],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, durationMinutes: r.duration }));
}

export type DaySchedule = { work: Interval[]; busy: Interval[] };

/** Working intervals, plus live appointments and time off, for each member on one local day. */
export async function loadDaySchedules(
  q: Queryable,
  day: LocalDay,
  memberIds: string[],
  options: { excludeAppointmentIds?: string[] } = {},
): Promise<Map<string, DaySchedule>> {
  const dayStart = day.start.toMillis();
  const dayEnd = day.start.plus({ days: 1 }).toMillis();
  const result = new Map<string, DaySchedule>(memberIds.map((id) => [id, { work: [], busy: [] }]));

  const hours = await q.query<{ member_id: string; start_minute: number; end_minute: number }>(
    `SELECT member_id, start_minute, end_minute FROM working_hours
     WHERE member_id = ANY($1::uuid[]) AND weekday = $2 ORDER BY start_minute`,
    [memberIds, day.weekday],
  );
  for (const h of hours.rows) {
    result.get(h.member_id)!.work.push({ start: atMinute(day, h.start_minute), end: atMinute(day, h.end_minute) });
  }

  const busy = await q.query<{ member_id: string; start: Date; end: Date }>(
    `SELECT staff_id AS member_id, starts_at AS start, blocked_until AS end FROM appointments
     WHERE staff_id = ANY($1::uuid[]) AND status IN ('pending', 'offered', 'confirmed')
       AND starts_at < $3 AND blocked_until > $2 AND NOT (id = ANY($4::uuid[]))
     UNION ALL
     SELECT member_id, starts_at, ends_at FROM time_off
     WHERE member_id = ANY($1::uuid[]) AND starts_at < $3 AND ends_at > $2`,
    [memberIds, new Date(dayStart), new Date(dayEnd), options.excludeAppointmentIds ?? []],
  );
  for (const b of busy.rows) {
    result.get(b.member_id)!.busy.push({ start: b.start.getTime(), end: b.end.getTime() });
  }
  return result;
}

/** Booked minutes per member on a day, used to pick the least-loaded staff member. */
export async function dayLoadMinutes(q: Queryable, day: LocalDay, memberIds: string[]): Promise<Map<string, number>> {
  const { rows } = await q.query<{ member_id: string; minutes: number }>(
    `SELECT staff_id AS member_id, (sum(extract(epoch FROM ends_at - starts_at)) / 60)::int AS minutes
     FROM appointments
     WHERE staff_id = ANY($1::uuid[]) AND status IN ('pending', 'offered', 'confirmed')
       AND starts_at >= $2 AND starts_at < $3
     GROUP BY staff_id`,
    [memberIds, day.start.toJSDate(), day.start.plus({ days: 1 }).toJSDate()],
  );
  return new Map(rows.map((r) => [r.member_id, r.minutes]));
}

/** Customers may book from now + lead time, rounded up to 5 minutes. */
export function earliestStart(shop: Shop, now: Date): number {
  return ceilToMinutes(now.getTime() + shop.min_lead_minutes * MINUTE, 5);
}

export function assertWithinHorizon(shop: Shop, now: Date, startsAt: Date) {
  if (startsAt.getTime() > now.getTime() + shop.booking_horizon_days * 24 * 60 * MINUTE) {
    throw badRequest('BEYOND_HORIZON', 'This date is too far ahead');
  }
}
