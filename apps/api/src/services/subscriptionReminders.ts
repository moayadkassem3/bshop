import type pg from 'pg';
import type { Deps } from '../deps.js';
import { sms } from '../messages.js';
import { queueSms } from '../notifications.js';

const DAY = 86_400_000;

type Kind = 'trial_3d' | 'trial_1d' | 'trial_ended' | 'period_3d' | 'payment_late' | 'hidden';
type Row = { shop_id: string; name: string; status: string; current_period_end: Date | null; grace_until: Date | null; phone: string | null };

const dayMonth = (d: Date) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' }).format(d);

/**
 * Subscription reminders (v1.7). The salon's owner gets an SMS 3 days and 1 day
 * before the free trial ends and when it has ended; 3 days before a paid period
 * ends, when it has ended (7 days' grace), and when the salon is hidden. Each
 * links to the website's payment page (Aboneliğim → Ödeme): the store apps never sell, so this is
 * how owners find where to pay. Each reminder goes out once per period; none
 * while the owner has already asked our team to start the subscription, nor for
 * a salon taken down by our team. Runs with the other timers.
 */
export async function sendSubscriptionReminders(tx: pg.PoolClient, deps: Deps, now: Date): Promise<number> {
  const { rows } = await tx.query<Row>(
    `SELECT s.id AS shop_id, s.name, sub.status, sub.current_period_end, sub.grace_until, u.phone
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     LEFT JOIN shop_members o ON o.shop_id = s.id AND o.owner_label = 'owner' AND o.active
     LEFT JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
     WHERE s.reviewed_at IS NOT NULL AND s.suspended_at IS NULL AND sub.current_period_end IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM subscription_requests r WHERE r.shop_id = s.id AND r.handled_at IS NULL)
       AND (
         (sub.status IN ('trial', 'active') AND sub.current_period_end BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz + interval '3 days')
         OR (sub.status = 'past_due' AND sub.grace_until BETWEEN $1::timestamptz - interval '2 days' AND $1::timestamptz + interval '8 days')
       )`,
    [now],
  );
  // Straight to the payment page (EFT / Havale) since 12 November 2026.
  const link = `${deps.config.publicWebUrl}/abonelik/odeme`;
  let sent = 0;
  for (const r of rows) {
    if (!r.phone || !r.current_period_end) continue;
    const end = r.current_period_end;
    const left = end.getTime() - now.getTime();
    let kind: Kind | null = null;
    let body = '';
    let period = end;
    if (r.status === 'trial') {
      if (left <= 0) [kind, body] = ['trial_ended', sms.trialEnded({ shop: r.name, link })];
      else if (left <= DAY) [kind, body] = ['trial_1d', sms.trialEnding({ shop: r.name, days: 1, link })];
      else if (left <= 3 * DAY) [kind, body] = ['trial_3d', sms.trialEnding({ shop: r.name, days: Math.ceil(left / DAY), link })];
    } else if (r.status === 'active') {
      if (left > 0 && left <= 3 * DAY) [kind, body] = ['period_3d', sms.periodEnding({ shop: r.name, date: dayMonth(end), link })];
    } else if (r.status === 'past_due' && r.grace_until) {
      period = end;
      if (r.grace_until <= now) [kind, body] = ['hidden', sms.hiddenUnpaid({ shop: r.name, link })];
      else [kind, body] = ['payment_late', sms.paymentLate({ shop: r.name, date: dayMonth(r.grace_until), link })];
    }
    if (!kind) continue;
    // A 1-day reminder makes the 3-day one pointless if it was missed (e.g. the server was down).
    const claimed = await tx.query(
      `INSERT INTO subscription_reminders (shop_id, kind, period_end, sent_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [r.shop_id, kind, period, now],
    );
    if (!claimed.rowCount) continue;
    await queueSms(tx, now, { shopId: r.shop_id, phone: r.phone, template: `subscription_${kind}`, body });
    sent++;
  }
  return sent;
}
