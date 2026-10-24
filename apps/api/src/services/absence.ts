import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { fits } from '../domain/availability.js';
import { localDayOf } from '../domain/time.js';
import { push, sms } from '../messages.js';
import { queuePush, queueSms } from '../notifications.js';
import { requireMember, requireOwner, requireSelfOrOwner } from './access.js';
import type { User } from './auth.js';
import { messageContext, ownerUserIds, type AppointmentRow } from './booking.js';
import { dayLoadMinutes, eligibleStaff, loadDaySchedules } from './schedule.js';
import type { Shop } from './shops.js';

type Affected = {
  appointmentId: string;
  status: string;
  startsAt: Date;
  customerName: string;
  requestedStaff: boolean;
  suggestedStaffId: string | null;
  suggestedStaffName: string | null;
};

async function affectedAppointments(tx: pg.PoolClient, memberId: string, startsAt: Date, endsAt: Date) {
  const { rows } = await tx.query<AppointmentRow>(
    `SELECT * FROM appointments WHERE staff_id = $1 AND status IN ('pending', 'confirmed')
     AND starts_at < $3 AND ends_at > $2 ORDER BY starts_at`,
    [memberId, startsAt, endsAt],
  );
  return rows;
}

/** Staff (optionally limited to `onlyIds`) who perform the appointment's services and are free at its time. */
async function freeStaffFor(tx: pg.PoolClient, shop: Shop, appt: AppointmentRow, onlyIds?: string[]) {
  const serviceIds = (
    await tx.query<{ service_id: string }>(
      'SELECT service_id FROM appointment_services WHERE appointment_id = $1 ORDER BY position',
      [appt.id],
    )
  ).rows.map((r) => r.service_id);
  const candidates = (await eligibleStaff(tx, shop.id, serviceIds)).filter(
    (s) => s.id !== appt.staff_id && (!onlyIds || onlyIds.includes(s.id)),
  );
  if (!candidates.length) return [];
  const day = localDayOf(appt.starts_at, shop.timezone);
  const schedules = await loadDaySchedules(tx, day, candidates.map((c) => c.id));
  return candidates.filter((c) =>
    fits(appt.starts_at.getTime(), {
      ...schedules.get(c.id)!,
      durationMinutes: c.durationMinutes,
      bufferMinutes: shop.buffer_minutes,
      earliest: Number.MIN_SAFE_INTEGER,
    }),
  );
}

/** The suggested replacement: lightest load that day among free staff. */
async function suggestReplacement(tx: pg.PoolClient, shop: Shop, appt: AppointmentRow) {
  const free = await freeStaffFor(tx, shop, appt);
  if (!free.length) return null;
  const load = await dayLoadMinutes(tx, localDayOf(appt.starts_at, shop.timezone), free.map((f) => f.id));
  return free.reduce((best, f) => ((load.get(f.id) ?? 0) < (load.get(best.id) ?? 0) ? f : best));
}

/**
 * Step 1–2 of handoff 4.8: record the absence (new bookings stop at once) and
 * list affected appointments with a suggested replacement for each.
 */
export async function markAbsence(
  deps: Deps,
  user: User,
  shopId: string,
  input: { staffId: string; startsAt: Date; endsAt: Date; note?: string | null },
) {
  const member = await requireMember(deps.db, user, shopId);
  requireSelfOrOwner(member, input.staffId);
  if (input.endsAt <= input.startsAt) throw badRequest('INVALID_RANGE');
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shop_members WHERE id = $1 AND shop_id = $2 FOR UPDATE', [input.staffId, shopId]);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO time_off (shop_id, member_id, kind, starts_at, ends_at, note, created_by)
       VALUES ($1, $2, 'absence', $3, $4, $5, $6) RETURNING id`,
      [shopId, input.staffId, input.startsAt, input.endsAt, input.note ?? null, user.id],
    );
    const absenceId = rows[0]!.id;
    const affected = await describeAffected(tx, shopId, absenceId);

    // Step 6: when staff mark their own absence and it affects bookings, owners are alerted.
    if (member.role !== 'owner' && affected.length) {
      const staffName = (await tx.query<{ display_name: string }>('SELECT display_name FROM shop_members WHERE id = $1', [input.staffId]))
        .rows[0]!.display_name;
      await queuePush(tx, now, {
        shopId,
        userIds: await ownerUserIds(tx, shopId),
        template: 'absence_review',
        ...push.absenceNeedsReview({ staff: staffName, count: affected.length }),
        data: { absenceId, kind: 'absence' },
      });
    }
    return { absenceId, affected };
  });
}

async function describeAffected(tx: pg.PoolClient, shopId: string, absenceId: string): Promise<Affected[]> {
  const absence = (
    await tx.query<{ member_id: string; starts_at: Date; ends_at: Date }>(
      `SELECT member_id, starts_at, ends_at FROM time_off WHERE id = $1 AND shop_id = $2 AND kind = 'absence'`,
      [absenceId, shopId],
    )
  ).rows[0];
  if (!absence) throw notFound('Absence');
  const shop = (await tx.query<Shop>('SELECT * FROM shops WHERE id = $1', [shopId])).rows[0]!;
  const result: Affected[] = [];
  for (const a of await affectedAppointments(tx, absence.member_id, absence.starts_at, absence.ends_at)) {
    const suggestion = await suggestReplacement(tx, shop, a);
    result.push({
      appointmentId: a.id,
      status: a.status,
      startsAt: a.starts_at,
      customerName: a.guest_name ?? a.customer_name,
      requestedStaff: a.requested_staff,
      suggestedStaffId: suggestion?.id ?? null,
      suggestedStaffName: suggestion?.displayName ?? null,
    });
  }
  return result;
}

export async function getAbsence(deps: Deps, user: User, shopId: string, absenceId: string) {
  await requireOwner(deps.db, user, shopId);
  return withTx(deps.db, (tx) => describeAffected(tx, shopId, absenceId));
}

export type AbsenceDecision =
  | { appointmentId: string; action: 'reassign'; staffId: string }
  | { appointmentId: string; action: 'cancel' };

/**
 * Steps 3–5 of handoff 4.8, applied by the owner ("Uygula"). Reassigned bookings
 * keep their time and status; customers get an SMS. The shop's cutoff does not
 * apply and nothing is added to the customer's record.
 */
export async function applyAbsence(deps: Deps, user: User, shopId: string, absenceId: string, decisions: AbsenceDecision[]) {
  await requireOwner(deps.db, user, shopId);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const absence = (
      await tx.query<{ member_id: string; starts_at: Date; ends_at: Date }>(
        `SELECT member_id, starts_at, ends_at FROM time_off WHERE id = $1 AND shop_id = $2 AND kind = 'absence'`,
        [absenceId, shopId],
      )
    ).rows[0];
    if (!absence) throw notFound('Absence');
    const shop = (await tx.query<Shop>('SELECT * FROM shops WHERE id = $1', [shopId])).rows[0]!;
    const link = `${deps.config.publicWebUrl}/randevularim`;
    const results: { appointmentId: string; outcome: 'reassigned' | 'cancelled' }[] = [];

    for (const d of decisions) {
      const appt = (
        await tx.query<AppointmentRow>(
          `SELECT * FROM appointments WHERE id = $1 AND shop_id = $2 AND staff_id = $3
           AND status IN ('pending', 'confirmed') AND starts_at < $5 AND ends_at > $4 FOR UPDATE`,
          [d.appointmentId, shopId, absence.member_id, absence.starts_at, absence.ends_at],
        )
      ).rows[0];
      if (!appt) throw notFound(`Affected appointment ${d.appointmentId}`);
      const before = await messageContext(tx, appt.id);

      if (d.action === 'cancel') {
        await tx.query(
          `UPDATE appointments SET status = 'cancelled', cancel_reason = 'staff_absence', cancelled_at = $2, updated_at = $2
           WHERE id = $1`,
          [appt.id, now],
        );
        if (appt.customer_phone) {
          await queueSms(tx, now, {
            shopId,
            appointmentId: appt.id,
            phone: appt.customer_phone,
            userId: appt.customer_id,
            template: 'cancelled_staff_absence',
            body: sms.cancelledByShop({ shop: before.shop_name, when: before.when, link }),
          });
        }
        results.push({ appointmentId: appt.id, outcome: 'cancelled' });
        continue;
      }

      await tx.query('SELECT id FROM shop_members WHERE id = $1 AND shop_id = $2 FOR UPDATE', [d.staffId, shopId]);
      const target = (await freeStaffFor(tx, shop, appt, [d.staffId]))[0];
      if (!target) throw conflict('STAFF_NOT_FREE', 'The chosen staff member cannot take this appointment');
      const newEnd = new Date(appt.starts_at.getTime() + target.durationMinutes * 60_000);
      await tx.query(
        `UPDATE appointments SET staff_id = $2, ends_at = $3, blocked_until = $4, updated_at = $5 WHERE id = $1`,
        [appt.id, target.id, newEnd, new Date(newEnd.getTime() + shop.buffer_minutes * 60_000), now],
      );
      const after = await messageContext(tx, appt.id);
      if (appt.customer_phone) {
        const base = { shop: after.shop_name, when: after.when, link, staff: after.staff_name };
        await queueSms(tx, now, {
          shopId,
          appointmentId: appt.id,
          phone: appt.customer_phone,
          userId: appt.customer_id,
          template: appt.requested_staff ? 'reassigned_choice' : 'reassigned_info',
          body: appt.requested_staff
            ? sms.reassignedChoice({ ...base, previousStaff: before.staff_name })
            : sms.reassignedInfo(base),
        });
      }
      await queuePush(tx, now, {
        shopId,
        appointmentId: appt.id,
        userIds: [after.staff_user_id],
        template: 'reassigned_to_you',
        ...push.reassignedToYou(after.appt),
        data: { appointmentId: appt.id, kind: appt.status === 'pending' ? 'request' : 'confirmed' },
      });
      results.push({ appointmentId: appt.id, outcome: 'reassigned' });
    }
    return results;
  });
}
