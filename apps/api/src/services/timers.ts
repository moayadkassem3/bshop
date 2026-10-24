import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { push } from '../messages.js';
import { queuePush } from '../notifications.js';
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
    return { reminders: reminders.rowCount ?? 0, confirmed: confirmed.rowCount ?? 0 };
  });
}
