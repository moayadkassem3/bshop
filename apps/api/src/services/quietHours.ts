import { DateTime } from 'luxon';
import type { Queryable } from '../db.js';

/**
 * Whether the salon is open at this moment (founder, 7 November 2026: no alarm
 * outside working hours; 10 November: an ordinary notification instead, SMS as usual). The salon's hours are what customers see on its page:
 * from the earliest start to the latest end of anyone bookable that weekday, in
 * the salon's time zone. A salon with no hours that day counts as closed.
 */
export async function shopOpenAt(q: Queryable, shopId: string, at: Date): Promise<boolean> {
  const { rows } = await q.query<{ timezone: string; open: number | null; close: number | null; weekday: number }>(
    `SELECT s.timezone,
       (SELECT min(w.start_minute) FROM working_hours w JOIN shop_members m ON m.id = w.member_id
          WHERE w.shop_id = s.id AND m.active AND m.bookable AND w.weekday = x.weekday)::int AS open,
       (SELECT max(w.end_minute) FROM working_hours w JOIN shop_members m ON m.id = w.member_id
          WHERE w.shop_id = s.id AND m.active AND m.bookable AND w.weekday = x.weekday)::int AS close,
       x.weekday
     FROM shops s
     CROSS JOIN LATERAL (SELECT extract(isodow FROM $2::timestamptz AT TIME ZONE s.timezone)::int AS weekday) x
     WHERE s.id = $1`,
    [shopId, at],
  );
  const r = rows[0];
  if (!r || r.open === null || r.close === null) return false;
  const local = DateTime.fromJSDate(at, { zone: r.timezone });
  const minute = local.hour * 60 + local.minute;
  return minute >= r.open && minute < r.close;
}
