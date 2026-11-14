import type pg from 'pg';
import { DateTime } from 'luxon';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { candidateStarts, fits } from '../domain/availability.js';
import { localDay, localDayOf, MINUTE } from '../domain/time.js';
import { push, sms } from '../messages.js';
import { queuePush, queueSms } from '../notifications.js';
import { requireMember, requireSelfOrOwner } from './access.js';
import type { User } from './auth.js';
import { messageContext, type AppointmentRow } from './booking.js';
import { assertWithinHorizon, earliestStart, loadDaySchedules } from './schedule.js';
import { getShopById, type Shop } from './shops.js';

/** How long the customer has to answer an offered time, and how close to it they may still answer. */
const REPLY_HOURS = 12;
const ANSWER_BEFORE_START_MINUTES = 60;
const MIN_REPLY_MINUTES = 15;

async function lockPending(tx: pg.PoolClient, user: User, shopId: string, id: string, now: Date) {
  const member = await requireMember(tx, user, shopId);
  const { rows } = await tx.query<AppointmentRow>('SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE', [id, shopId]);
  const appt = rows[0];
  if (!appt) throw notFound('Appointment');
  requireSelfOrOwner(member, appt.staff_id);
  // Past its deadline a request is already confirmed by rule, even before the timer runs.
  if (appt.status !== 'pending' || (appt.deadline_at && appt.deadline_at <= now)) {
    throw conflict('NOT_PENDING', `Appointment is ${appt.deadline_at && appt.deadline_at <= now ? 'confirmed' : appt.status}`);
  }
  return appt;
}

const durationMinutes = (a: AppointmentRow) => Math.round((a.ends_at.getTime() - a.starts_at.getTime()) / MINUTE);

/** Free start times on a day for the same staff member and services, ignoring the request's own time. */
async function freeStarts(q: pg.PoolClient | Deps['db'], shop: Shop, appt: AppointmentRow, date: string, now: Date) {
  const day = localDay(date, shop.timezone);
  const schedule = (await loadDaySchedules(q, day, [appt.staff_id], { excludeAppointmentIds: [appt.id] })).get(appt.staff_id)!;
  return {
    schedule,
    starts: candidateStarts({
      ...schedule,
      durationMinutes: durationMinutes(appt),
      bufferMinutes: shop.buffer_minutes,
      stepMinutes: shop.slot_step_minutes,
      dayStart: day.start.toMillis(),
      earliest: earliestStart(shop, now),
    }),
  };
}

/** Times the salon could offer instead, on one day. */
export async function offerTimes(deps: Deps, user: User, shopId: string, id: string, date: string) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const appt = await lockPending(tx, user, shopId, id, now);
    const shop = await getShopById(tx, shopId);
    const lastDay = localDayOf(new Date(now.getTime() + shop.booking_horizon_days * 86_400_000), shop.timezone);
    if (localDay(date, shop.timezone).start > lastDay.start) return [];
    const { starts } = await freeStarts(tx, shop, appt, date, now);
    // Only times the customer still has a fair chance to answer before.
    return starts
      .filter((t) => t !== appt.starts_at.getTime() && replyDeadline(now, new Date(t)) !== null)
      .map((t) => new Date(t).toISOString());
  });
}

/** Up to REPLY_HOURS, and at least an hour before the offered time; null when there is no time left to answer. */
function replyDeadline(now: Date, startsAt: Date): Date | null {
  const deadline = Math.min(now.getTime() + REPLY_HOURS * 60 * MINUTE, startsAt.getTime() - ANSWER_BEFORE_START_MINUTES * MINUTE);
  return deadline >= now.getTime() + MIN_REPLY_MINUTES * MINUTE ? new Date(deadline) : null;
}

/**
 * "Başka saat öner": the request moves to the offered time and holds it as
 * 'offered' until the customer answers. The original time is released.
 */
export async function offerNewTime(deps: Deps, user: User, shopId: string, id: string, startsAt: Date) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const appt = await lockPending(tx, user, shopId, id, now);
    const shop = await getShopById(tx, shopId);
    assertWithinHorizon(shop, now, startsAt);
    if (startsAt.getTime() === appt.starts_at.getTime()) throw badRequest('SAME_TIME', 'Offer a different time');
    const deadline = replyDeadline(now, startsAt);
    if (!deadline) throw badRequest('OFFER_TOO_SOON', 'This time is too soon for the customer to answer');
    await tx.query('SELECT id FROM shop_members WHERE id = $1 FOR UPDATE', [appt.staff_id]);
    const date = DateTime.fromJSDate(startsAt, { zone: shop.timezone }).toISODate()!;
    const { schedule } = await freeStarts(tx, shop, appt, date, now);
    const ok = fits(startsAt.getTime(), {
      ...schedule,
      durationMinutes: durationMinutes(appt),
      bufferMinutes: shop.buffer_minutes,
      earliest: earliestStart(shop, now),
    });
    if (!ok) throw conflict('SLOT_TAKEN', 'This time is not free');

    const endsAt = new Date(startsAt.getTime() + durationMinutes(appt) * MINUTE);
    await tx.query(
      `UPDATE appointments SET status = 'offered', offered_from = starts_at, starts_at = $2, ends_at = $3, blocked_until = $4,
         deadline_at = $5, reminder_at = NULL, responded_by = $6, updated_at = $7
       WHERE id = $1`,
      [id, startsAt, endsAt, new Date(endsAt.getTime() + shop.buffer_minutes * MINUTE), deadline, user.id, now],
    );
    if (appt.customer_phone) {
      await queueSms(tx, now, {
        shopId,
        appointmentId: id,
        phone: appt.customer_phone,
        userId: appt.customer_id,
        template: 'time_offered',
        body: sms.timeOffered({
          shop: shop.name,
          from: short(appt.starts_at, null, shop.timezone),
          when: short(startsAt, appt.starts_at, shop.timezone),
          deadline: short(deadline, startsAt, shop.timezone),
          link: `${deps.config.publicWebUrl}/randevularim`,
        }),
      });
    }
    return { status: 'offered' as const, startsAt, deadlineAt: deadline };
  });
}

/** "31 Ekim 15:00", or just "15:00" when it falls on the same day as `sameDayAs`. */
function short(at: Date, sameDayAs: Date | null, timezone: string) {
  const t = DateTime.fromJSDate(at, { zone: timezone }).setLocale('tr');
  const same = sameDayAs && DateTime.fromJSDate(sameDayAs, { zone: timezone }).hasSame(t, 'day');
  return t.toFormat(same ? 'HH:mm' : 'd MMMM HH:mm');
}

async function lockOffer(tx: pg.PoolClient, user: User, id: string) {
  const { rows } = await tx.query<AppointmentRow>('SELECT * FROM appointments WHERE id = $1 AND customer_id = $2 FOR UPDATE', [id, user.id]);
  const appt = rows[0];
  if (!appt) throw notFound('Appointment');
  return appt;
}

async function tellStaff(tx: pg.PoolClient, now: Date, appt: AppointmentRow, kind: 'offerAccepted' | 'offerDeclined' | 'offerExpired') {
  const c = await messageContext(tx, appt.id);
  await queuePush(tx, now, {
    shopId: appt.shop_id,
    appointmentId: appt.id,
    userIds: [c.staff_user_id, ...(appt.responded_by && appt.responded_by !== c.staff_user_id ? [appt.responded_by] : [])],
    template: kind,
    ...push[kind](c.appt),
    data: { appointmentId: appt.id, kind },
  });
}

/** The customer takes the offered time: it is confirmed. */
export async function acceptOffer(deps: Deps, user: User, id: string) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const appt = await lockOffer(tx, user, id);
    if (appt.status !== 'offered' || !appt.deadline_at || appt.deadline_at <= now) {
      throw conflict('OFFER_CLOSED', 'This offer is no longer open');
    }
    await tx.query(`UPDATE appointments SET status = 'confirmed', confirmed_via = 'offer', updated_at = $2 WHERE id = $1`, [id, now]);
    await tellStaff(tx, now, appt, 'offerAccepted');
    return { status: 'confirmed' as const };
  });
}

/** The customer turns the offered time down: the slot is released. */
export async function declineOffer(deps: Deps, user: User, id: string) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const appt = await lockOffer(tx, user, id);
    if (appt.status !== 'offered') throw conflict('OFFER_CLOSED', 'This offer is no longer open');
    await tx.query(`UPDATE appointments SET status = 'declined', updated_at = $2 WHERE id = $1`, [id, now]);
    await tellStaff(tx, now, appt, 'offerDeclined');
    return { status: 'declined' as const };
  });
}

/** Timer: offers nobody answered in time are closed and their slot released. */
export async function expireOffers(tx: pg.PoolClient, now: Date) {
  const { rows } = await tx.query<AppointmentRow>(
    `UPDATE appointments SET status = 'declined', updated_at = $1
     WHERE status = 'offered' AND deadline_at <= $1 RETURNING *`,
    [now],
  );
  for (const appt of rows) await tellStaff(tx, now, appt, 'offerExpired');
  return rows.length;
}

