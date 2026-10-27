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
 * The person's own app notifications, newest first: the same messages the
 * phone receives as push, so the website can show them too (v1.7).
 */
export async function listMyNotifications(deps: Deps, user: User, input: { after?: Date; limit?: number } = {}) {
  const { rows } = await deps.db.query<InboxItem>(
    `SELECT id, shop_id, appointment_id, template, payload->>'title' AS title, body, created_at
     FROM notifications
     WHERE channel = 'push' AND recipient_user_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)
     ORDER BY created_at DESC LIMIT $3`,
    [user.id, input.after ?? null, input.limit ?? 50],
  );
  return rows;
}
