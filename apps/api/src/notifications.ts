import type { Deps } from './deps.js';
import { withTx, type Queryable } from './db.js';

export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}

export type PushMessage = { title: string; body: string; data: Record<string, unknown> };

export interface PushProvider {
  send(userId: string, message: PushMessage): Promise<void>;
}

/** Development providers: print instead of sending. */
export const consoleSms: SmsProvider = {
  async send(to, text) {
    console.log(`[sms] ${to}: ${text}`);
  },
};

export const consolePush: PushProvider = {
  async send(userId, message) {
    console.log(`[push] ${userId}: ${message.title} — ${message.body}`);
  },
};

type Base = { shopId: string | null; appointmentId?: string | null; template: string };

export async function queueSms(q: Queryable, now: Date, n: Base & { phone: string; userId?: string | null; body: string }) {
  await q.query(
    `INSERT INTO notifications (shop_id, appointment_id, channel, recipient_user_id, recipient_phone, template, body, created_at)
     VALUES ($1, $2, 'sms', $3, $4, $5, $6, $7)`,
    [n.shopId, n.appointmentId ?? null, n.userId ?? null, n.phone, n.template, n.body, now],
  );
}

export async function queuePush(
  q: Queryable,
  now: Date,
  n: Base & { userIds: string[]; title: string; body: string; data?: Record<string, unknown> },
) {
  for (const userId of new Set(n.userIds)) {
    await q.query(
      `INSERT INTO notifications (shop_id, appointment_id, channel, recipient_user_id, template, body, payload, created_at)
       VALUES ($1, $2, 'push', $3, $4, $5, $6, $7)`,
      [n.shopId, n.appointmentId ?? null, userId, n.template, n.body, { title: n.title, data: n.data ?? {} }, now],
    );
  }
}

type Row = {
  id: string;
  channel: 'sms' | 'push';
  recipient_user_id: string | null;
  recipient_phone: string | null;
  body: string;
  payload: { title?: string; data?: Record<string, unknown> };
};

/** Sends queued notifications. Safe to run from several workers at once. */
export async function dispatchNotifications(deps: Deps, limit = 50): Promise<number> {
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<Row>(
      `SELECT id, channel, recipient_user_id, recipient_phone, body, payload FROM notifications
       WHERE status = 'queued' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    for (const n of rows) {
      try {
        if (n.channel === 'sms') await deps.sms.send(n.recipient_phone!, n.body);
        else
          await deps.push.send(n.recipient_user_id!, {
            title: n.payload.title ?? '',
            body: n.body,
            data: n.payload.data ?? {},
          });
        await tx.query(`UPDATE notifications SET status = 'sent', sent_at = $2 WHERE id = $1`, [n.id, deps.clock.now()]);
      } catch (err) {
        await tx.query(`UPDATE notifications SET status = 'failed', error = $2 WHERE id = $1`, [n.id, String(err)]);
      }
    }
    return rows.length;
  });
}
