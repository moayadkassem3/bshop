import type { Deps } from '../deps.js';
import type { User } from './auth.js';

export type InboxItem = {
  id: string;
  shop_id: string | null;
  appointment_id: string | null;
  template: string;
  title: string | null;
  body: string;
  created_at: Date;
};

/**
 * The person's own notifications, newest first: the push alerts the staff app
 * gets, and a customer's SMS about their appointments (confirmed, declined,
 * cancelled or moved by the salon, another time offered), so the website can
 * mark what changed (v1.7). Sign-in codes are never listed.
 */
export async function listMyNotifications(deps: Deps, user: User, input: { after?: Date; limit?: number } = {}) {
  const { rows } = await deps.db.query<InboxItem>(
    `SELECT id, shop_id, appointment_id, template, payload->>'title' AS title, body, created_at
     FROM notifications
     WHERE (channel = 'push' OR appointment_id IS NOT NULL) AND recipient_user_id = $1
       AND ($2::timestamptz IS NULL OR created_at > $2)
     ORDER BY created_at DESC LIMIT $3`,
    [user.id, input.after ?? null, input.limit ?? 50],
  );
  return rows;
}
