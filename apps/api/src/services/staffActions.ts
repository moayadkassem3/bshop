import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { normalizePhone } from '../phone.js';
import { requireMember, requireSelfOrOwner, type Membership } from './access.js';
import type { User } from './auth.js';
import { createStaffAppointment, queueResultSms, type AppointmentRow } from './booking.js';

/** Loads and locks an appointment the caller may act on: their own, or any in the shop for owners. */
async function lockForStaff(tx: pg.PoolClient, user: User, shopId: string, appointmentId: string) {
  const member = await requireMember(tx, user, shopId);
  const { rows } = await tx.query<AppointmentRow>('SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 FOR UPDATE', [
    appointmentId,
    shopId,
  ]);
  const appt = rows[0];
  if (!appt) throw notFound('Appointment');
  requireSelfOrOwner(member, appt.staff_id);
  return { member, appt };
}

export type ActionResult = { status: AppointmentRow['status']; confirmedVia?: string | null };

/**
 * Confirm a pending request. The status check and update happen under the row
 * lock, so a staff tap and the automatic confirmation can never both win: the
 * second one sees the result of the first (handoff 5, one final outcome).
 */
export async function confirmAppointment(deps: Deps, user: User, shopId: string, id: string): Promise<ActionResult> {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { appt } = await lockForStaff(tx, user, shopId, id);
    if (appt.status === 'confirmed') return { status: 'confirmed', confirmedVia: appt.confirmed_via };
    if (appt.status !== 'pending') throw conflict('NOT_PENDING', `Appointment is ${appt.status}`);
    // Past the deadline the booking is already confirmed by rule, even if the timer has not run yet.
    const via = appt.deadline_at && appt.deadline_at <= now ? 'timeout' : 'staff';
    await tx.query(
      `UPDATE appointments SET status = 'confirmed', confirmed_via = $4, responded_by = $2, updated_at = $3 WHERE id = $1`,
      [id, via === 'staff' ? user.id : null, now, via],
    );
    await queueResultSms(tx, deps, id, 'confirmed');
    return { status: 'confirmed', confirmedVia: via };
  });
}

/**
 * Decline a pending request and release its time. Declining an appointment that
 * already confirmed follows the cancellation workflow instead (handoff 5).
 */
export async function declineAppointment(deps: Deps, user: User, shopId: string, id: string): Promise<ActionResult> {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { appt } = await lockForStaff(tx, user, shopId, id);
    const pastDeadline = appt.deadline_at !== null && appt.deadline_at <= now;
    if (appt.status === 'pending' && !pastDeadline) {
      await tx.query(`UPDATE appointments SET status = 'declined', responded_by = $2, updated_at = $3 WHERE id = $1`, [
        id,
        user.id,
        now,
      ]);
      await queueResultSms(tx, deps, id, 'declined');
      return { status: 'declined' };
    }
    if (appt.status === 'confirmed' || appt.status === 'pending') return cancelLocked(tx, deps, user, appt, now);
    throw conflict('NOT_PENDING', `Appointment is ${appt.status}`);
  });
}

async function cancelLocked(tx: pg.PoolClient, deps: Deps, user: User, appt: AppointmentRow, now: Date): Promise<ActionResult> {
  await tx.query(
    `UPDATE appointments SET status = 'cancelled', cancel_reason = 'shop', cancelled_at = $3, responded_by = $2, updated_at = $3
     WHERE id = $1`,
    [appt.id, user.id, now],
  );
  await queueResultSms(tx, deps, appt.id, 'cancelledByShop');
  return { status: 'cancelled' };
}

export async function cancelByShop(deps: Deps, user: User, shopId: string, id: string): Promise<ActionResult> {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { appt } = await lockForStaff(tx, user, shopId, id);
    if (!['pending', 'confirmed'].includes(appt.status)) throw conflict('NOT_CANCELLABLE', `Appointment is ${appt.status}`);
    return cancelLocked(tx, deps, user, appt, now);
  });
}

/** After the start time: the appointment took place, or the customer did not come. */
export async function markOutcome(
  deps: Deps,
  user: User,
  shopId: string,
  id: string,
  outcome: 'completed' | 'no_show',
): Promise<ActionResult> {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { appt } = await lockForStaff(tx, user, shopId, id);
    if (appt.status !== 'confirmed') throw conflict('NOT_CONFIRMED', `Appointment is ${appt.status}`);
    if (appt.starts_at > now) throw badRequest('NOT_STARTED', 'The appointment has not started yet');
    await tx.query('UPDATE appointments SET status = $2, updated_at = $3 WHERE id = $1', [id, outcome, now]);
    if (outcome === 'no_show' && appt.customer_id) {
      await tx.query(
        `INSERT INTO shop_customers (shop_id, user_id, no_show_count) VALUES ($1, $2, 1)
         ON CONFLICT (shop_id, user_id) DO UPDATE SET no_show_count = shop_customers.no_show_count + 1`,
        [shopId, appt.customer_id],
      );
    }
    return { status: outcome };
  });
}

/** Staff see their own schedule; owners see everyone's. Customer phone numbers are visible to both (handoff 3). */
export async function listShopAppointments(
  deps: Deps,
  user: User,
  shopId: string,
  input: { from: Date; to: Date; staffId?: string },
) {
  const member = await requireMember(deps.db, user, shopId);
  const staffFilter = member.role === 'owner' ? (input.staffId ?? null) : member.id;
  const { rows } = await deps.db.query(
    `SELECT a.id, a.staff_id, m.display_name AS staff_name, a.status, a.source, a.starts_at, a.ends_at,
       a.customer_id, a.customer_name, a.customer_phone, a.guest_name, a.requested_staff, a.confirmed_via,
       a.deadline_at, a.reminder_at, a.cancel_reason, a.total_price_kurus, a.price_is_starting_from,
       sc.no_show_count, sc.late_cancel_count,
       (SELECT json_agg(json_build_object('name', x.name, 'durationMinutes', x.duration_minutes, 'priceKurus', x.price_kurus)
          ORDER BY x.position) FROM appointment_services x WHERE x.appointment_id = a.id) AS services
     FROM appointments a
     JOIN shop_members m ON m.id = a.staff_id
     LEFT JOIN shop_customers sc ON sc.shop_id = a.shop_id AND sc.user_id = a.customer_id
     WHERE a.shop_id = $1 AND a.starts_at < $3 AND a.ends_at > $2 AND ($4::uuid IS NULL OR a.staff_id = $4)
     ORDER BY a.starts_at`,
    [shopId, input.from, input.to, staffFilter],
  );
  return rows;
}

export async function addStaffAppointment(
  deps: Deps,
  user: User,
  shopId: string,
  input: {
    staffId: string;
    serviceIds: string[];
    startsAt?: Date;
    customerName: string;
    customerPhone?: string | null;
    walkIn: boolean;
  },
) {
  const member = await requireMember(deps.db, user, shopId);
  requireSelfOrOwner(member, input.staffId);
  return createStaffAppointment(deps, shopId, {
    ...input,
    startsAt: input.walkIn ? deps.clock.now() : input.startsAt!,
    customerPhone: input.customerPhone ? normalizePhone(input.customerPhone) : null,
  });
}

/** Blocked time. It may not cover live appointments; use the absence flow for that. */
export async function blockTime(
  deps: Deps,
  user: User,
  shopId: string,
  input: { staffId: string; startsAt: Date; endsAt: Date; note?: string | null },
) {
  const member = await requireMember(deps.db, user, shopId);
  requireSelfOrOwner(member, input.staffId);
  if (input.endsAt <= input.startsAt) throw badRequest('INVALID_RANGE');
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shop_members WHERE id = $1 FOR UPDATE', [input.staffId]);
    const clash = await tx.query(
      `SELECT 1 FROM appointments WHERE staff_id = $1 AND status IN ('pending', 'confirmed')
       AND starts_at < $3 AND blocked_until > $2 LIMIT 1`,
      [input.staffId, input.startsAt, input.endsAt],
    );
    if (clash.rowCount) throw conflict('OVERLAPS_APPOINTMENTS', 'This time has appointments; mark an absence instead');
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO time_off (shop_id, member_id, kind, starts_at, ends_at, note, created_by)
       VALUES ($1, $2, 'block', $3, $4, $5, $6) RETURNING id`,
      [shopId, input.staffId, input.startsAt, input.endsAt, input.note ?? null, user.id],
    );
    return { id: rows[0]!.id };
  });
}

export async function removeTimeOff(deps: Deps, user: User, shopId: string, timeOffId: string) {
  const member: Membership = await requireMember(deps.db, user, shopId);
  const { rows } = await deps.db.query<{ member_id: string }>('SELECT member_id FROM time_off WHERE id = $1 AND shop_id = $2', [
    timeOffId,
    shopId,
  ]);
  if (!rows[0]) throw notFound('Time off');
  requireSelfOrOwner(member, rows[0].member_id);
  await deps.db.query('DELETE FROM time_off WHERE id = $1', [timeOffId]);
}
