import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { push } from '../messages.js';
import { queuePush } from '../notifications.js';
import { expireOffers } from './offers.js';
import { sendSubscriptionReminders } from './subscriptionReminders.js';
import { messageContext, ownerUserIds, queueResultSms } from './booking.js';

/**
 * Runs due reminders and automatic confirmations (handoff 4.4). Called every
 * few seconds by the worker. Each row is claimed by an UPDATE ... WHERE
 * status = 'pending', so a staff response and this timer never both apply.
 */
export async function runTimers(deps: Deps) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    // Reminders whose deadline has not passed yet; to the assigned staff member and the owners.
    const reminders = await tx.query<{ id: string; shop_id: string }>(
      `UPDATE appointments SET reminder_sent_at = $1
       WHERE status = 'pending' AND reminder_at <= $1 AND reminder_sent_at IS NULL AND deadline_at > $1
       RETURNING id, shop_id`,
      [now],
    );
    for (const r of reminders.rows) {
      const c = await messageContext(tx, r.id);
      await queuePush(tx, now, {
        shopId: r.shop_id,
        appointmentId: r.id,
        userIds: [c.staff_user_id, ...(await ownerUserIds(tx, r.shop_id))],
        template: 'reminder',
        ...push.reminder({ ...c.appt, deadline: c.deadline }),
        data: { appointmentId: r.id, kind: 'reminder' },
      });
    }

    const confirmed = await tx.query<{ id: string; shop_id: string }>(
      `UPDATE appointments SET status = 'confirmed', confirmed_via = 'timeout', updated_at = $1
       WHERE status = 'pending' AND deadline_at <= $1
       RETURNING id, shop_id`,
      [now],
    );
    for (const r of confirmed.rows) {
      const c = await messageContext(tx, r.id);
      await queuePush(tx, now, {
        shopId: r.shop_id,
        appointmentId: r.id,
        userIds: [c.staff_user_id],
        template: 'auto_confirmed',
        ...push.autoConfirmed(c.appt),
        data: { appointmentId: r.id, kind: 'auto_confirmed' },
      });
      await queueResultSms(tx, deps, r.id, 'confirmed');
    }
    // The customer's reminder in the app (phase 3): two hours before, once, and not for
    // appointments booked less than two hours ahead.
    const upcoming = await tx.query<{ id: string; shop_id: string; customer_id: string }>(
      `UPDATE appointments SET customer_reminded_at = $1
       WHERE status = 'confirmed' AND customer_id IS NOT NULL AND customer_reminded_at IS NULL
         AND starts_at > $1 AND starts_at <= $1 + interval '2 hours' AND created_at < starts_at - interval '2 hours'
       RETURNING id, shop_id, customer_id`,
      [now],
    );
    for (const r of upcoming.rows) {
      const c = await messageContext(tx, r.id);
      await queuePush(tx, now, {
        shopId: r.shop_id,
        appointmentId: r.id,
        userIds: [r.customer_id],
        template: 'customer_reminder',
        ...push.customerReminder({ shop: c.shop_name, when: c.when, staff: c.staff_name }),
        data: { appointmentId: r.id, kind: 'customer' },
      });
    }
    const offersExpired = await expireOffers(tx, now);

    // A paid period that ended without a new payment: late, with the contract's 7-day grace (v1.7).
    const lapsed = await tx.query(
      `UPDATE subscriptions SET status = 'past_due', grace_until = current_period_end + interval '7 days', updated_at = $1
       WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end <= $1`,
      [now],
    );
    const subscriptionReminders = await sendSubscriptionReminders(tx, deps, now);
    return { reminders: reminders.rowCount ?? 0, confirmed: confirmed.rowCount ?? 0, offersExpired, lapsed: lapsed.rowCount ?? 0, subscriptionReminders };
  });
}
