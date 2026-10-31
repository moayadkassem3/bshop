import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { fits } from '../domain/availability.js';
import { confirmationTimers, inAutoConfirmHours, type WeeklyWindow } from '../domain/confirmation.js';
import { localDayOf, MINUTE } from '../domain/time.js';
import { formatTime, formatWhen, push, sms } from '../messages.js';
import { queuePush, queueSms } from '../notifications.js';
import { upsertUserByPhone, type User } from './auth.js';
import { hasAccepted } from './consents.js';
import { getPublicShopBySlug, type Shop } from './shops.js';
import {
  assertWithinHorizon,
  dayLoadMinutes,
  earliestStart,
  eligibleStaff,
  loadDaySchedules,
  loadServices,
  type ServiceRow,
} from './schedule.js';

export const MAX_PEOPLE_PER_GROUP = 3;

export type BookingItem = {
  serviceIds: string[];
  /** null = "Fark etmez (ilk müsait)". */
  staffId: string | null;
  startsAt: Date;
  /** Set when booking for someone else (handoff 4.7). */
  guestName?: string | null;
};

export type AppointmentRow = {
  id: string;
  shop_id: string;
  group_id: string | null;
  staff_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  guest_name: string | null;
  starts_at: Date;
  ends_at: Date;
  blocked_until: Date;
  status: 'pending' | 'offered' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';
  source: 'online' | 'staff_entry' | 'walk_in';
  requested_staff: boolean;
  confirmed_via: string | null;
  deadline_at: Date | null;
  reminder_at: Date | null;
  responded_by: string | null;
  /** The time the customer asked for, when the salon offered another (v1.7). */
  offered_from: Date | null;
  cancel_reason: string | null;
  total_price_kurus: number;
  price_is_starting_from: boolean;
};

/** Everything needed to word a message about one appointment. */
export async function messageContext(q: Queryable, appointmentId: string) {
  const { rows } = await q.query<{
    shop_id: string;
    shop_name: string;
    timezone: string;
    staff_id: string;
    staff_user_id: string;
    staff_name: string;
    customer_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    guest_name: string | null;
    starts_at: Date;
    deadline_at: Date | null;
    services: string;
  }>(
    `SELECT a.shop_id, s.name AS shop_name, s.timezone, a.staff_id, m.user_id AS staff_user_id,
       m.display_name AS staff_name, a.customer_id, a.customer_name, a.customer_phone, a.guest_name,
       a.starts_at, a.deadline_at,
       (SELECT string_agg(x.name, ' + ' ORDER BY x.position) FROM appointment_services x WHERE x.appointment_id = a.id) AS services
     FROM appointments a JOIN shops s ON s.id = a.shop_id JOIN shop_members m ON m.id = a.staff_id
     WHERE a.id = $1`,
    [appointmentId],
  );
  const r = rows[0]!;
  const who = r.guest_name ? `${r.guest_name} (${r.customer_name} adına)` : r.customer_name;
  return {
    ...r,
    when: formatWhen(r.starts_at, r.timezone),
    deadline: r.deadline_at ? formatTime(r.deadline_at, r.timezone) : '',
    appt: { customer: who, services: r.services, when: formatWhen(r.starts_at, r.timezone) },
  };
}

export async function ownerUserIds(q: Queryable, shopId: string): Promise<string[]> {
  const { rows } = await q.query<{ user_id: string }>(
    `SELECT user_id FROM shop_members WHERE shop_id = $1 AND role = 'owner' AND active`,
    [shopId],
  );
  return rows.map((r) => r.user_id);
}

/** Queues the customer's SMS with the final result: confirmed or declined (handoff 2, v1.1). */
export async function queueResultSms(
  q: Queryable,
  deps: Deps,
  appointmentId: string,
  kind: 'confirmed' | 'declined' | 'cancelledByShop',
) {
  const c = await messageContext(q, appointmentId);
  if (!c.customer_phone) return;
  const ctx = { shop: c.shop_name, when: c.when, link: `${deps.config.publicWebUrl}/randevularim` };
  const body = kind === 'confirmed' ? sms.confirmed({ ...ctx, staff: c.staff_name }) : sms[kind](ctx);
  await queueSms(q, deps.clock.now(), {
    shopId: c.shop_id,
    appointmentId,
    phone: c.customer_phone,
    userId: c.customer_id,
    template: kind,
    body,
  });
}

async function lockStaff(tx: pg.PoolClient, staffIds: string[]) {
  // A fixed lock order prevents deadlocks between concurrent bookings.
  await tx.query('SELECT id FROM shop_members WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [staffIds]);
}

async function insertAppointment(
  tx: pg.PoolClient,
  a: Omit<AppointmentRow, 'id' | 'reminder_at' | 'cancel_reason' | 'responded_by' | 'offered_from'> & { reminder_at: Date | null; now: Date },
  services: (ServiceRow & { duration: number })[],
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO appointments (shop_id, group_id, staff_id, customer_id, customer_name, customer_phone, guest_name,
       starts_at, ends_at, blocked_until, status, source, requested_staff, confirmed_via, deadline_at, reminder_at,
       total_price_kurus, price_is_starting_from, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
     RETURNING id`,
    [
      a.shop_id,
      a.group_id,
      a.staff_id,
      a.customer_id,
      a.customer_name,
      a.customer_phone,
      a.guest_name,
      a.starts_at,
      a.ends_at,
      a.blocked_until,
      a.status,
      a.source,
      a.requested_staff,
      a.confirmed_via,
      a.deadline_at,
      a.reminder_at,
      a.total_price_kurus,
      a.price_is_starting_from,
      a.now,
    ],
  );
  const id = rows[0]!.id;
  for (const [i, s] of services.entries()) {
    await tx.query(
      `INSERT INTO appointment_services (appointment_id, position, service_id, name, duration_minutes, price_kurus, price_is_starting_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, i, s.id, s.name, s.duration, s.price_kurus, s.price_is_starting_from],
    );
  }
  return id;
}

/** Per-staff durations for the chosen services (staff override, else shop default). */
async function serviceDurations(q: Queryable, staffId: string, services: ServiceRow[]) {
  const { rows } = await q.query<{ service_id: string; duration_minutes: number | null }>(
    'SELECT service_id, duration_minutes FROM member_services WHERE member_id = $1 AND service_id = ANY($2::uuid[])',
    [staffId, services.map((s) => s.id)],
  );
  return services.map((s) => ({
    ...s,
    duration: rows.find((r) => r.service_id === s.id)?.duration_minutes ?? s.duration_minutes,
  }));
}

/**
 * Customer booking (handoff 4.3). One request holds 1–3 people (a booking group).
 * Runs in one transaction: shop and customer checks, slot re-check under staff
 * locks, insert, then alerts. The database's no-overlap constraint is the last guard.
 */
export async function createBooking(
  deps: Deps,
  user: User,
  slug: string,
  input: { items: BookingItem[]; firstName?: string; lastName?: string },
) {
  if (input.items.length < 1 || input.items.length > MAX_PEOPLE_PER_GROUP) {
    throw badRequest('GROUP_SIZE', `A booking holds 1 to ${MAX_PEOPLE_PER_GROUP} people`);
  }
  const now = deps.clock.now();

  return withTx(deps.db, async (tx) => {
    const shop = await getPublicShopBySlug(tx, now, slug);

    // People who work at the shop do not book it as customers (v1.7): their own
    // request would ring their own phone and count in the shop's figures.
    const member = await tx.query('SELECT 1 FROM shop_members WHERE shop_id = $1 AND user_id = $2 AND active', [shop.id, user.id]);
    if (member.rowCount) throw new AppError(403, 'OWN_SHOP', 'Members of a shop cannot book it as customers');

    const names = await tx.query<{ first_name: string | null; last_name: string | null }>(
      `UPDATE users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name)
       WHERE id = $1 RETURNING first_name, last_name`,
      [user.id, input.firstName?.trim() || null, input.lastName?.trim() || null],
    );
    const { first_name, last_name } = names.rows[0]!;
    if (!first_name || !last_name) throw badRequest('NAME_REQUIRED', 'First name and surname are required');
    const customerName = `${first_name} ${last_name}`;

    // Lock this customer's standing with the shop: serialises their concurrent requests.
    await tx.query('INSERT INTO shop_customers (shop_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [shop.id, user.id]);
    const standing = (
      await tx.query<{ blocked: boolean }>(
        'SELECT blocked FROM shop_customers WHERE shop_id = $1 AND user_id = $2 FOR UPDATE',
        [shop.id, user.id],
      )
    ).rows[0]!;
    if (standing.blocked) throw forbidden('This shop is not accepting bookings from this account');
    if (!(await hasAccepted(tx, user.id, 'kullanici-sozlesmesi'))) {
      throw new AppError(403, 'TERMS_REQUIRED', 'Accept the user agreement to book');
    }

    const pending = await tx.query(
      `SELECT 1 FROM appointments WHERE shop_id = $1 AND customer_id = $2 AND status IN ('pending', 'offered') LIMIT 1`,
      [shop.id, user.id],
    );
    if (pending.rowCount) throw conflict('PENDING_EXISTS', 'You already have a request waiting for this shop');

    const future = await tx.query<{ n: number }>(
      `SELECT count(DISTINCT COALESCE(group_id, id))::int AS n FROM appointments
       WHERE shop_id = $1 AND customer_id = $2 AND status IN ('pending', 'offered', 'confirmed') AND starts_at > $3`,
      [shop.id, user.id, now],
    );
    if (future.rows[0]!.n >= shop.max_future_bookings) {
      throw conflict('BOOKING_LIMIT', 'You have reached the number of upcoming bookings allowed at this shop');
    }

    const windows = (
      await tx.query<WeeklyWindow>('SELECT weekday, start_minute, end_minute FROM auto_confirm_hours WHERE shop_id = $1', [
        shop.id,
      ])
    ).rows;
    const group = (
      await tx.query<{ id: string }>(
        'INSERT INTO booking_groups (shop_id, customer_id, created_at) VALUES ($1, $2, $3) RETURNING id',
        [shop.id, user.id, now],
      )
    ).rows[0]!;

    const created: { id: string; status: string; staffId: string; startsAt: Date; deadlineAt: Date | null }[] = [];
    for (const item of input.items) {
      const appt = await bookOne(tx, shop, now, item, windows);
      const timers = appt.instant ? null : confirmationTimers(now, item.startsAt);
      const id = await insertAppointment(
        tx,
        {
          shop_id: shop.id,
          group_id: group.id,
          staff_id: appt.staffId,
          customer_id: user.id,
          customer_name: customerName,
          customer_phone: user.phone,
          guest_name: item.guestName?.trim() || null,
          starts_at: item.startsAt,
          ends_at: appt.endsAt,
          blocked_until: appt.blockedUntil,
          status: appt.instant ? 'confirmed' : 'pending',
          source: 'online',
          requested_staff: item.staffId !== null,
          confirmed_via: appt.instant ? 'auto_hours' : null,
          deadline_at: timers?.deadlineAt ?? null,
          reminder_at: timers?.reminderAt ?? null,
          total_price_kurus: appt.services.reduce((s, x) => s + x.price_kurus, 0),
          price_is_starting_from: appt.services.some((x) => x.price_is_starting_from),
          now,
        },
        appt.services,
      );
      created.push({
        id,
        status: appt.instant ? 'confirmed' : 'pending',
        staffId: appt.staffId,
        startsAt: item.startsAt,
        deadlineAt: timers?.deadlineAt ?? null,
      });

      // Every new appointment gets the special alert (handoff 4.5).
      const c = await messageContext(tx, id);
      const message = appt.instant ? push.newConfirmed(c.appt) : push.newRequest({ ...c.appt, deadline: c.deadline });
      await queuePush(tx, now, {
        shopId: shop.id,
        appointmentId: id,
        userIds: [c.staff_user_id],
        template: appt.instant ? 'new_confirmed' : 'new_request',
        ...message,
        data: { appointmentId: id, kind: appt.instant ? 'confirmed' : 'request' },
      });
      if (appt.instant) await queueResultSms(tx, deps, id, 'confirmed');
    }
    return { groupId: group.id, appointments: created };
  });
}

async function bookOne(tx: pg.PoolClient, shop: Shop, now: Date, item: BookingItem, windows: WeeklyWindow[]) {
  assertWithinHorizon(shop, now, item.startsAt);
  const services = await loadServices(tx, shop.id, item.serviceIds);
  const eligible = await eligibleStaff(tx, shop.id, item.serviceIds);
  const candidates = item.staffId ? eligible.filter((s) => s.id === item.staffId) : eligible;
  if (candidates.length === 0) throw badRequest('STAFF_NOT_ELIGIBLE', 'No staff member offers these services');

  await lockStaff(tx, candidates.map((c) => c.id));
  const day = localDayOf(item.startsAt, shop.timezone);
  const schedules = await loadDaySchedules(tx, day, candidates.map((c) => c.id));
  const earliest = earliestStart(shop, now);
  const free = candidates.filter((c) =>
    fits(item.startsAt.getTime(), {
      ...schedules.get(c.id)!,
      durationMinutes: c.durationMinutes,
      bufferMinutes: shop.buffer_minutes,
      earliest,
    }),
  );
  if (free.length === 0) throw conflict('SLOT_TAKEN', 'Bu saat az önce doldu');

  // "Fark etmez": the free staff member with the lightest load that day.
  let chosen = free[0]!;
  if (!item.staffId && free.length > 1) {
    const load = await dayLoadMinutes(tx, day, free.map((f) => f.id));
    chosen = free.reduce((best, f) => ((load.get(f.id) ?? 0) < (load.get(best.id) ?? 0) ? f : best));
  }
  const endsAt = new Date(item.startsAt.getTime() + chosen.durationMinutes * MINUTE);
  return {
    staffId: chosen.id,
    services: await serviceDurations(tx, chosen.id, services),
    endsAt,
    blockedUntil: new Date(endsAt.getTime() + shop.buffer_minutes * MINUTE),
    instant: inAutoConfirmHours(item.startsAt, shop.timezone, windows),
  };
}

/** Appointments booked by staff: phone bookings and walk-ins. Confirmed at once, no lead time or hours check. */
export async function createStaffAppointment(
  deps: Deps,
  shopId: string,
  input: {
    staffId: string;
    serviceIds: string[];
    startsAt: Date;
    customerName: string;
    customerPhone?: string | null;
    walkIn: boolean;
  },
) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const services = await loadServices(tx, shopId, input.serviceIds);
    const eligible = (await eligibleStaff(tx, shopId, input.serviceIds)).find((s) => s.id === input.staffId);
    if (!eligible) throw badRequest('STAFF_NOT_ELIGIBLE', 'This staff member does not offer these services');
    await lockStaff(tx, [input.staffId]);
    const shop = (await tx.query<Shop>('SELECT * FROM shops WHERE id = $1', [shopId])).rows[0]!;
    const schedules = await loadDaySchedules(tx, localDayOf(input.startsAt, shop.timezone), [input.staffId]);
    const ok = fits(input.startsAt.getTime(), {
      busy: schedules.get(input.staffId)!.busy,
      work: [{ start: Number.MIN_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER }],
      durationMinutes: eligible.durationMinutes,
      bufferMinutes: shop.buffer_minutes,
      earliest: Number.MIN_SAFE_INTEGER,
    });
    if (!ok) throw conflict('SLOT_TAKEN', 'This time overlaps another appointment or blocked time');

    // A phone number links the record to the customer's account, now or when they first sign in.
    const customerId = input.customerPhone ? await upsertUserByPhone(tx, input.customerPhone) : null;
    const endsAt = new Date(input.startsAt.getTime() + eligible.durationMinutes * MINUTE);
    const id = await insertAppointment(
      tx,
      {
        shop_id: shopId,
        group_id: null,
        staff_id: input.staffId,
        customer_id: customerId,
        customer_name: input.customerName.trim(),
        customer_phone: input.customerPhone ?? null,
        guest_name: null,
        starts_at: input.startsAt,
        ends_at: endsAt,
        blocked_until: new Date(endsAt.getTime() + shop.buffer_minutes * MINUTE),
        status: 'confirmed',
        source: input.walkIn ? 'walk_in' : 'staff_entry',
        requested_staff: true,
        confirmed_via: 'staff_entry',
        deadline_at: null,
        reminder_at: null,
        total_price_kurus: services.reduce((s, x) => s + x.price_kurus, 0),
        price_is_starting_from: services.some((x) => x.price_is_starting_from),
        now,
      },
      await serviceDurations(tx, input.staffId, services),
    );
    return { id };
  });
}

export async function listCustomerAppointments(deps: Deps, user: User) {
  const { rows } = await deps.db.query(
    `SELECT a.id, a.status, a.starts_at, a.ends_at, a.deadline_at, a.offered_from, a.guest_name, a.total_price_kurus,
       a.price_is_starting_from, a.confirmed_via, a.cancel_reason,
       s.name AS shop_name, s.slug AS shop_slug, s.address AS shop_address, s.cancellation_cutoff_minutes,
       m.display_name AS staff_name,
       (SELECT json_agg(json_build_object('name', x.name, 'durationMinutes', x.duration_minutes, 'priceKurus', x.price_kurus)
          ORDER BY x.position) FROM appointment_services x WHERE x.appointment_id = a.id) AS services
     FROM appointments a JOIN shops s ON s.id = a.shop_id JOIN shop_members m ON m.id = a.staff_id
     WHERE a.customer_id = $1 AND a.source = 'online'
     ORDER BY a.starts_at DESC LIMIT 100`,
    [user.id],
  );
  return rows;
}

/** Customers may always cancel; inside the shop's cutoff it is recorded as a late cancellation (handoff 2.1). */
export async function cancelByCustomer(deps: Deps, user: User, appointmentId: string) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<AppointmentRow & { cutoff: number }>(
      `SELECT a.*, s.cancellation_cutoff_minutes AS cutoff FROM appointments a JOIN shops s ON s.id = a.shop_id
       WHERE a.id = $1 AND a.customer_id = $2 FOR UPDATE OF a`,
      [appointmentId, user.id],
    );
    const a = rows[0];
    if (!a) throw notFound('Appointment');
    if (!['pending', 'confirmed'].includes(a.status) || a.starts_at <= now) {
      throw conflict('NOT_CANCELLABLE', 'This appointment can no longer be cancelled');
    }
    const late = a.status === 'confirmed' && a.starts_at.getTime() - now.getTime() < a.cutoff * MINUTE;
    await tx.query(
      `UPDATE appointments SET status = 'cancelled', cancel_reason = $2, cancelled_at = $3, updated_at = $3 WHERE id = $1`,
      [a.id, late ? 'customer_late' : 'customer', now],
    );
    if (late) {
      await tx.query('UPDATE shop_customers SET late_cancel_count = late_cancel_count + 1 WHERE shop_id = $1 AND user_id = $2', [
        a.shop_id,
        user.id,
      ]);
    }
    const c = await messageContext(tx, a.id);
    // The staff member and the shop's owners and co-owners all hear about it (v1.7).
    const owners = await tx.query<{ user_id: string }>(
      "SELECT user_id FROM shop_members WHERE shop_id = $1 AND role = 'owner' AND active",
      [a.shop_id],
    );
    await queuePush(tx, now, {
      shopId: a.shop_id,
      appointmentId: a.id,
      userIds: [...new Set([c.staff_user_id, ...owners.rows.map((r) => r.user_id)])],
      template: 'customer_cancelled',
      ...push.customerCancelled({ ...c.appt, late }),
      data: { appointmentId: a.id, kind: 'cancelled' },
    });
    return { status: 'cancelled' as const, late };
  });
}
