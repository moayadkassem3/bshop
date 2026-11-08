import { DateTime } from 'luxon';
import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requirePlatformAdmin } from './access.js';
import type { User } from './auth.js';

/**
 * Announcements (founder, 8 November 2026): push notifications our team writes in
 * Yönetim → Bildirimler, e.g. "Bugün anlık çağrıları kaçırma" to salons on a Sunday
 * morning. Sent once (now or at a set time) or repeated every day / on chosen weekdays
 * at a time of day, Istanbul time. They reach people who use the app (a push needs a
 * phone) and have not turned announcements off in Profil; never at night.
 */

const ZONE = 'Europe/Istanbul';
/** Announcements go out between 09:00 and 21:00 only. */
export const SEND_FROM = 9 * 60;
export const SEND_UNTIL = 21 * 60;

export type Audience = 'customers' | 'businesses' | 'all';
export type AnnouncementInput = {
  title: string;
  body: string;
  audience: Audience;
  customerGender?: 'male' | 'female' | null;
  shopAudience?: 'men' | 'women' | 'unisex' | null;
  repeat: 'once' | 'daily' | 'weekly';
  /** Once: when to send it; left out, it goes now. */
  sendAt?: Date | null;
  /** Daily and weekly: minutes after midnight, Istanbul time. */
  timeOfDay?: number | null;
  /** Weekly: ISO weekdays, 1 = Monday. */
  weekdays?: number[];
};

type Row = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  customer_gender: 'male' | 'female' | null;
  shop_audience: 'men' | 'women' | 'unisex' | null;
  repeat: 'once' | 'daily' | 'weekly';
  time_of_day: number | null;
  weekdays: number[];
  next_run_at: Date | null;
  active: boolean;
  last_sent_at: Date | null;
  last_sent_count: number | null;
  total_sent: number;
  created_at: Date;
};

const COLUMNS = `id, title, body, audience, customer_gender, shop_audience, repeat, time_of_day, weekdays, next_run_at, active,
  last_sent_at, last_sent_count, total_sent, created_at`;

const minutesOf = (d: Date) => {
  const t = DateTime.fromJSDate(d, { zone: ZONE });
  return t.hour * 60 + t.minute;
};
const inWindow = (minutes: number) => minutes >= SEND_FROM && minutes <= SEND_UNTIL;

/** The first time after `after` that a repeating announcement is due. */
export function nextRepeat(a: { repeat: 'daily' | 'weekly'; time_of_day: number; weekdays: number[] }, after: Date): Date | null {
  const start = DateTime.fromJSDate(after, { zone: ZONE }).startOf('day');
  for (let i = 0; i <= 7; i++) {
    const day = start.plus({ days: i });
    if (a.repeat === 'weekly' && !a.weekdays.includes(day.weekday)) continue;
    const at = day.plus({ minutes: a.time_of_day });
    if (at.toMillis() > after.getTime()) return at.toJSDate();
  }
  return null;
}

function validate(input: AnnouncementInput, now: Date): { nextRunAt: Date; timeOfDay: number | null; weekdays: number[] } {
  if (input.repeat === 'once') {
    const at = input.sendAt ?? now;
    if (at.getTime() < now.getTime() - 60_000) throw badRequest('IN_THE_PAST', 'Pick a time in the future');
    if (!inWindow(minutesOf(at))) throw badRequest('OUTSIDE_SEND_HOURS', 'Announcements go out between 09:00 and 21:00');
    return { nextRunAt: at, timeOfDay: null, weekdays: [] };
  }
  const timeOfDay = input.timeOfDay;
  if (timeOfDay == null) throw badRequest('TIME_REQUIRED', 'Pick a time of day');
  if (!inWindow(timeOfDay)) throw badRequest('OUTSIDE_SEND_HOURS', 'Announcements go out between 09:00 and 21:00');
  const weekdays = input.repeat === 'weekly' ? [...new Set(input.weekdays ?? [])].sort() : [];
  if (input.repeat === 'weekly' && !weekdays.length) throw badRequest('WEEKDAYS_REQUIRED', 'Pick at least one day');
  const next = nextRepeat({ repeat: input.repeat, time_of_day: timeOfDay, weekdays }, now)!;
  return { nextRunAt: next, timeOfDay, weekdays };
}

/**
 * Who gets it: people with the app on a phone who have not turned announcements off.
 * Customers are people who do not work at a salon; salons are owners, co-owners and staff.
 */
function recipientsSql(audience: Audience, p: { gender: string; shopAudience: string }) {
  // Both filters are always in the query (as f.gender, f.shop_audience): Postgres refuses unused parameters.
  const customers = `(NOT EXISTS (SELECT 1 FROM shop_members m WHERE m.user_id = u.id AND m.active)
      AND (f.gender IS NULL OR u.gender = f.gender))`;
  const businesses = `EXISTS (SELECT 1 FROM shop_members m JOIN shops s ON s.id = m.shop_id
      WHERE m.user_id = u.id AND m.active AND (f.shop_audience IS NULL OR s.audience = f.shop_audience))`;
  const who = audience === 'customers' ? customers : audience === 'businesses' ? businesses : 'true';
  return `SELECT u.id FROM users u, (SELECT ${p.gender}::text AS gender, ${p.shopAudience}::text AS shop_audience) f
    WHERE u.deleted_at IS NULL AND NOT u.announcements_off
      AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)
      AND ${who}`;
}

const filters = (a: { audience: Audience; customer_gender: string | null; shop_audience: string | null }) => [
  a.audience === 'customers' ? a.customer_gender : null,
  a.audience === 'businesses' ? a.shop_audience : null,
];

/** How many people it would reach now, for the form. */
export async function countRecipients(deps: Deps, admin: User, input: Pick<AnnouncementInput, 'audience' | 'customerGender' | 'shopAudience'>) {
  requirePlatformAdmin(admin);
  const sql = recipientsSql(input.audience, { gender: '$1', shopAudience: '$2' });
  const { rows } = await deps.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM (${sql}) r`,
    filters({ audience: input.audience, customer_gender: input.customerGender ?? null, shop_audience: input.shopAudience ?? null }),
  );
  return { recipients: rows[0]!.n };
}

export async function listAnnouncements(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query<Row>(`SELECT ${COLUMNS} FROM announcements ORDER BY active DESC, created_at DESC`);
  return rows;
}

export async function createAnnouncement(deps: Deps, admin: User, input: AnnouncementInput) {
  requirePlatformAdmin(admin);
  const now = deps.clock.now();
  const v = validate(input, now);
  const { rows } = await deps.db.query<Row>(
    `INSERT INTO announcements (title, body, audience, customer_gender, shop_audience, repeat, time_of_day, weekdays, next_run_at, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING ${COLUMNS}`,
    [
      input.title.trim(),
      input.body.trim(),
      input.audience,
      input.audience === 'customers' ? (input.customerGender ?? null) : null,
      input.audience === 'businesses' ? (input.shopAudience ?? null) : null,
      input.repeat,
      v.timeOfDay,
      v.weekdays,
      v.nextRunAt,
      admin.id,
      now,
    ],
  );
  return rows[0]!;
}

/** Pause or resume: a resumed repeating one continues from its next time; a sent one-off cannot be resumed. */
export async function setAnnouncementActive(deps: Deps, admin: User, id: string, active: boolean) {
  requirePlatformAdmin(admin);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<Row>(`SELECT ${COLUMNS} FROM announcements WHERE id = $1 FOR UPDATE`, [id]);
    const a = rows[0];
    if (!a) throw notFound('Announcement');
    let next = a.next_run_at;
    if (active && a.repeat !== 'once') next = nextRepeat({ repeat: a.repeat, time_of_day: a.time_of_day!, weekdays: a.weekdays }, now);
    if (active && a.repeat === 'once' && (!next || a.last_sent_at)) throw badRequest('ALREADY_SENT', 'This announcement was already sent');
    await tx.query('UPDATE announcements SET active = $2, next_run_at = $3, updated_at = $4 WHERE id = $1', [id, active, next, now]);
  });
}

export async function deleteAnnouncement(deps: Deps, admin: User, id: string) {
  requirePlatformAdmin(admin);
  const r = await deps.db.query('DELETE FROM announcements WHERE id = $1', [id]);
  if (!r.rowCount) throw notFound('Announcement');
}

/** "Kendime test gönder": the same push to the admin's own phones only, at once. */
export async function sendTestAnnouncement(deps: Deps, admin: User, input: Pick<AnnouncementInput, 'title' | 'body'>) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query<{ n: number }>('SELECT count(*)::int AS n FROM push_devices WHERE user_id = $1', [admin.id]);
  if (!rows[0]!.n) return { sent: false, phones: 0 };
  await queueFor(deps.db, deps.clock.now(), { title: input.title.trim(), body: input.body.trim(), id: null }, 'SELECT $4::uuid AS id', [admin.id]);
  return { sent: true, phones: rows[0]!.n };
}

async function queueFor(q: Queryable, now: Date, a: { title: string; body: string; id: string | null }, recipients: string, params: unknown[]) {
  const payload = { title: a.title, data: { kind: 'announcement', ...(a.id ? { announcementId: a.id } : {}) } };
  const r = await q.query(
    `INSERT INTO notifications (shop_id, appointment_id, channel, recipient_user_id, template, body, payload, created_at)
     SELECT NULL, NULL, 'push', r.id, 'announcement', $1, $2, $3 FROM (${recipients}) r`,
    [a.body, payload, now, ...params],
  );
  return r.rowCount ?? 0;
}

/** Worker: queues the pushes of announcements that are due, then sets the next time. */
export async function runAnnouncements(deps: Deps) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<Row>(
      `SELECT ${COLUMNS} FROM announcements WHERE active AND next_run_at <= $1 ORDER BY next_run_at FOR UPDATE SKIP LOCKED`,
      [now],
    );
    let queued = 0;
    for (const a of rows) {
      // A worker that was down for hours does not send yesterday's morning message at night.
      const late = now.getTime() - a.next_run_at!.getTime() > 2 * 60 * 60_000 || !inWindow(minutesOf(now));
      const count = late ? 0 : await queueFor(tx, now, a, recipientsSql(a.audience, { gender: '$4', shopAudience: '$5' }), filters(a));
      queued += count;
      const next = a.repeat === 'once' ? null : nextRepeat({ repeat: a.repeat, time_of_day: a.time_of_day!, weekdays: a.weekdays }, now);
      await tx.query(
        `UPDATE announcements SET next_run_at = $2, active = $3, updated_at = $4,
           last_sent_at = CASE WHEN $6 THEN last_sent_at ELSE $4 END,
           last_sent_count = CASE WHEN $6 THEN last_sent_count ELSE $5 END,
           total_sent = total_sent + $5
         WHERE id = $1`,
        [a.id, next, next !== null, now, count, late],
      );
    }
    return queued;
  });
}

/** Profil → Duyurular. */
export async function announcementsSetting(deps: Deps, user: User) {
  const { rows } = await deps.db.query<{ off: boolean }>('SELECT announcements_off AS off FROM users WHERE id = $1', [user.id]);
  return { on: !rows[0]?.off };
}

export async function setAnnouncementsSetting(deps: Deps, user: User, on: boolean) {
  await deps.db.query('UPDATE users SET announcements_off = $2 WHERE id = $1', [user.id, !on]);
  return { on };
}
