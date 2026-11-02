import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { AppError } from '../errors.js';
import { push } from '../messages.js';
import { queuePush } from '../notifications.js';
import type { User } from './auth.js';
import { messageContext } from './booking.js';

const ACTIVE = `('pending', 'offered', 'confirmed')`;

type Membership = { id: string; shop_id: string; shop_name: string; role: 'owner' | 'staff'; owner_label: 'owner' | 'co_owner' | null };

export type DeletionPlan = {
  /** Upcoming bookings the person made, cancelled with the account (their salons are told). */
  cancels: number;
  /** Salons the person works at and leaves. */
  leaves: { shopId: string; name: string }[];
  /** Salons the person founded that a co-owner takes over. */
  handsOver: { shopId: string; name: string; to: string }[];
  /** Salons the person founded alone: closed to customers and the team. */
  closes: { shopId: string; name: string }[];
  /** What must happen first; deletion is refused until this is empty. */
  blockers: { code: 'HAS_UPCOMING_WORK' | 'SHOP_HAS_APPOINTMENTS'; shopId: string; name: string; count: number }[];
};

/**
 * What deleting this account would do (v1.7), shown before the person confirms.
 * Someone booked to cut hair, or a salon that would close with bookings still
 * ahead, must sort those out first, so no customer is left without notice.
 */
export async function planDeletion(q: Queryable, userId: string, now: Date): Promise<DeletionPlan & { memberships: Membership[]; coOwners: Map<string, { id: string; display_name: string }> }> {
  const cancels = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM appointments WHERE customer_id = $1 AND status IN ${ACTIVE} AND starts_at > $2`,
    [userId, now],
  );
  const { rows: memberships } = await q.query<Membership>(
    `SELECT m.id, m.shop_id, s.name AS shop_name, m.role, m.owner_label
     FROM shop_members m JOIN shops s ON s.id = m.shop_id WHERE m.user_id = $1 AND m.active ORDER BY m.created_at`,
    [userId],
  );
  const plan: DeletionPlan = { cancels: cancels.rows[0]!.n, leaves: [], handsOver: [], closes: [], blockers: [] };
  const coOwners = new Map<string, { id: string; display_name: string }>();

  for (const m of memberships) {
    const own = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM appointments WHERE staff_id = $1 AND status IN ${ACTIVE} AND starts_at > $2`,
      [m.id, now],
    );
    if (m.owner_label !== 'owner') {
      plan.leaves.push({ shopId: m.shop_id, name: m.shop_name });
      if (own.rows[0]!.n) plan.blockers.push({ code: 'HAS_UPCOMING_WORK', shopId: m.shop_id, name: m.shop_name, count: own.rows[0]!.n });
      continue;
    }
    const co = await q.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM shop_members
       WHERE shop_id = $1 AND id <> $2 AND role = 'owner' AND active ORDER BY created_at LIMIT 1`,
      [m.shop_id, m.id],
    );
    if (co.rows[0]) {
      coOwners.set(m.shop_id, co.rows[0]);
      plan.handsOver.push({ shopId: m.shop_id, name: m.shop_name, to: co.rows[0].display_name });
      if (own.rows[0]!.n) plan.blockers.push({ code: 'HAS_UPCOMING_WORK', shopId: m.shop_id, name: m.shop_name, count: own.rows[0]!.n });
    } else {
      plan.closes.push({ shopId: m.shop_id, name: m.shop_name });
      const all = await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM appointments WHERE shop_id = $1 AND status IN ${ACTIVE} AND starts_at > $2`,
        [m.shop_id, now],
      );
      if (all.rows[0]!.n) plan.blockers.push({ code: 'SHOP_HAS_APPOINTMENTS', shopId: m.shop_id, name: m.shop_name, count: all.rows[0]!.n });
    }
  }
  return { ...plan, memberships, coOwners };
}

export async function deletionPlan(deps: Deps, user: User): Promise<DeletionPlan> {
  const { memberships: _m, coOwners: _c, ...plan } = await planDeletion(deps.db, user.id, deps.clock.now());
  return plan;
}

/**
 * Deletes the account (v1.7): upcoming bookings are cancelled and their salons
 * told; the person leaves every salon (a founder's salon passes to a co-owner,
 * or closes); favourites, likes, messages, codes and sessions are deleted; past
 * appointments keep only "Silinmiş müşteri" for the salon's records; the phone
 * number is released. Agreement acceptances are kept as legal records.
 */
export async function deleteAccount(deps: Deps, user: User) {
  const now = deps.clock.now();
  await withTx(deps.db, async (tx) => {
    await tx.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const plan = await planDeletion(tx, user.id, now);
    if (plan.blockers.length) {
      const b = plan.blockers[0]!;
      throw new AppError(409, b.code, 'Upcoming appointments must be handled first', { shop: b.name, count: b.count });
    }

    // Bookings ahead: cancelled, and the staff member and the salon's owners are told.
    const upcoming = await tx.query<{ id: string; shop_id: string }>(
      `UPDATE appointments SET status = 'cancelled', cancel_reason = 'customer', cancelled_at = $2, updated_at = $2
       WHERE customer_id = $1 AND status IN ${ACTIVE} AND starts_at > $2 RETURNING id, shop_id`,
      [user.id, now],
    );
    for (const a of upcoming.rows) {
      const c = await messageContext(tx, a.id);
      const owners = await tx.query<{ user_id: string }>("SELECT user_id FROM shop_members WHERE shop_id = $1 AND role = 'owner' AND active", [a.shop_id]);
      await queuePush(tx, now, {
        shopId: a.shop_id,
        appointmentId: a.id,
        userIds: [...new Set([c.staff_user_id, ...owners.rows.map((r) => r.user_id)].filter((id) => id !== user.id))],
        template: 'customer_cancelled',
        ...push.customerCancelled({ ...c.appt, late: false }),
        data: { appointmentId: a.id, kind: 'cancelled' },
      });
    }

    // Salons.
    for (const m of plan.memberships) {
      const co = plan.coOwners.get(m.shop_id);
      if (m.owner_label === 'owner' && co) {
        await tx.query("UPDATE shop_members SET owner_label = 'owner' WHERE id = $1", [co.id]);
      } else if (m.owner_label === 'owner') {
        await tx.query("UPDATE subscriptions SET status = 'canceled', updated_at = $2 WHERE shop_id = $1", [m.shop_id, now]);
        await tx.query('UPDATE shop_members SET active = false, bookable = false WHERE shop_id = $1', [m.shop_id]);
      }
      await tx.query('UPDATE shop_members SET active = false, bookable = false, owner_label = NULL WHERE id = $1', [m.id]);
    }

    // The person's data.
    const { rows } = await tx.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [user.id]);
    const phone = rows[0]!.phone;
    await tx.query(
      `UPDATE appointments SET customer_name = 'Silinmiş müşteri', customer_phone = NULL, guest_name = NULL WHERE customer_id = $1`,
      [user.id],
    );
    await tx.query('DELETE FROM notifications WHERE recipient_user_id = $1 OR recipient_phone = $2', [user.id, phone]);
    await tx.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
    await tx.query('DELETE FROM customer_favorites WHERE user_id = $1', [user.id]);
    await tx.query('DELETE FROM haircut_likes WHERE user_id = $1', [user.id]);
    await tx.query('DELETE FROM shop_customers WHERE user_id = $1', [user.id]);
    await tx.query('UPDATE haircut_posts SET author_user_id = NULL WHERE author_user_id = $1', [user.id]);
    await tx.query(`UPDATE quote_requests SET contact_name = 'Silinmiş kullanıcı', phone = '', email = NULL, user_id = NULL WHERE user_id = $1`, [user.id]);
    await tx.query('UPDATE subscription_requests SET user_id = NULL WHERE user_id = $1', [user.id]);
    await tx.query(
      `UPDATE users SET phone = 'silindi:' || id, first_name = NULL, last_name = NULL, gender = NULL, verified_at = NULL,
         is_platform_admin = false, deleted_at = $2 WHERE id = $1`,
      [user.id, now],
    );
    // Signed out everywhere.
    await tx.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  });
}
