import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { planForStaff } from '../domain/plans.js';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { formatPrice, sms } from '../messages.js';
import { queueSms } from '../notifications.js';
import { requireOwner, requirePlatformAdmin } from './access.js';
import { recordPayment } from './admin.js';
import type { User } from './auth.js';

/**
 * Paying for the subscription on the website (founder, 12 November 2026). The store apps
 * never sell, so owners pay here; the reminder SMS link to this page. For now by EFT /
 * Havale only; iyzico and bank card are listed but closed until their set-up is ready.
 *
 * Verifying a transfer: the owner writes their phone number in the transfer's Açıklama
 * and taps "Ödemeyi yaptım". That leaves a notice for our team (and an SMS to us); we find
 * the transfer in the bank statement by the phone number and amount, and confirm it in
 * Yönetim → Talepler, which records the payment and extends the subscription. The owner
 * gets an SMS either way.
 */

/** How many months can be paid at once. */
export const PAYMENT_MONTHS = [1, 3, 6, 12] as const;

const dayMonthYear = (d: Date) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(d);
/** "+905321234567" → "05321234567": how people write their number in a bank's Açıklama. */
const national = (phone: string) => phone.replace(/^\+90/, '0');

type Notice = { id: string; months: number; amount_kurus: number; reference: string; status: string; created_at: Date };

async function shopForPayment(deps: Deps, shopId: string) {
  const { rows } = await deps.db.query<{ name: string; seats: number; status: string; current_period_end: Date | null }>(
    `SELECT s.name, sub.status, sub.current_period_end,
       (SELECT count(*)::int FROM shop_members m WHERE m.shop_id = s.id AND m.active AND m.bookable) AS seats
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id WHERE s.id = $1`,
    [shopId],
  );
  if (!rows[0]) throw notFound('Shop');
  return { ...rows[0], plan: planForStaff(rows[0].seats) };
}

/** The payment page: what to pay, how, and what to write in the Açıklama. */
export async function paymentOptions(deps: Deps, user: User, shopId: string) {
  await requireOwner(deps.db, user, shopId);
  const shop = await shopForPayment(deps, shopId);
  const pending = await deps.db.query<Notice>(
    `SELECT id, months, amount_kurus, reference, status, created_at FROM payment_notices WHERE shop_id = $1 AND status = 'pending'`,
    [shopId],
  );
  // The last answer, so the page can say "ödemeniz alındı" or "görünmüyor" after our team looked.
  const last = await deps.db.query<Notice & { handled_at: Date }>(
    `SELECT id, months, amount_kurus, reference, status, created_at, handled_at FROM payment_notices
     WHERE shop_id = $1 AND status IN ('confirmed', 'rejected') ORDER BY handled_at DESC LIMIT 1`,
    [shopId],
  );
  const account = deps.config.paymentAccount;
  return {
    shopName: shop.name,
    subscription: { status: shop.status, currentPeriodEnd: shop.current_period_end },
    seats: shop.seats,
    plan: shop.plan,
    months: PAYMENT_MONTHS,
    /** What to write in the transfer's Açıklama. */
    reference: national(user.phone),
    methods: [
      { id: 'havale', label: 'EFT / Havale', enabled: Boolean(account && shop.plan) },
      { id: 'iyzico', label: 'iyzico', enabled: false },
      { id: 'kart', label: 'Banka kartı', enabled: false },
    ],
    account,
    pendingNotice: pending.rows[0] ?? null,
    lastNotice: last.rows[0] ?? null,
  };
}

/** "Ödemeyi yaptım": tells our team a transfer was sent. One open notice per salon. */
export async function notifyPayment(deps: Deps, user: User, shopId: string, input: { months: number }) {
  await requireOwner(deps.db, user, shopId);
  if (!deps.config.paymentAccount) throw new AppError(409, 'PAYMENT_NOT_READY', 'Bank transfer is not set up yet');
  if (!(PAYMENT_MONTHS as readonly number[]).includes(input.months)) throw badRequest('INVALID_MONTHS', 'Pick 1, 3, 6 or 12 months');
  const shop = await shopForPayment(deps, shopId);
  if (!shop.plan) throw new AppError(409, 'CUSTOM_PRICE', 'This salon is priced individually');
  const amount = shop.plan.monthlyPriceKurus * input.months;
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shops WHERE id = $1 FOR UPDATE', [shopId]);
    const open = await tx.query('SELECT 1 FROM payment_notices WHERE shop_id = $1 AND status = $2', [shopId, 'pending']);
    if (open.rowCount) throw conflict('PAYMENT_NOTICE_EXISTS', 'A payment notice is already waiting');
    const reference = national(user.phone);
    const { rows } = await tx.query<Notice>(
      `INSERT INTO payment_notices (shop_id, user_id, months, amount_kurus, method, reference, created_at)
       VALUES ($1, $2, $3, $4, 'havale', $5, $6) RETURNING id, months, amount_kurus, reference, status, created_at`,
      [shopId, user.id, input.months, amount, reference, now],
    );
    const admins = await tx.query<{ id: string; phone: string }>('SELECT id, phone FROM users WHERE is_platform_admin');
    for (const admin of admins.rows) {
      await queueSms(tx, now, {
        shopId,
        userId: admin.id,
        phone: admin.phone,
        template: 'payment_notice',
        body: sms.paymentNotice({ salon: shop.name, amount: formatPrice(amount), months: input.months, reference }),
      });
    }
    return rows[0]!;
  });
}

/** The owner takes a notice back (tapped by mistake, or will pay later). */
export async function withdrawPaymentNotice(deps: Deps, user: User, shopId: string, id: string) {
  await requireOwner(deps.db, user, shopId);
  const r = await deps.db.query(`UPDATE payment_notices SET status = 'withdrawn', handled_at = $3 WHERE id = $1 AND shop_id = $2 AND status = 'pending'`, [
    id,
    shopId,
    deps.clock.now(),
  ]);
  if (!r.rowCount) throw notFound('Payment notice');
}

/** Yönetim → Talepler: notices waiting first, then the latest answered ones. */
export async function listPaymentNotices(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query(
    `SELECT n.id, n.shop_id, n.months, n.amount_kurus, n.reference, n.status, n.created_at, n.handled_at,
       s.name AS shop_name, s.slug, u.phone, COALESCE(u.first_name || ' ' || u.last_name, '') AS payer
     FROM payment_notices n JOIN shops s ON s.id = n.shop_id LEFT JOIN users u ON u.id = n.user_id
     WHERE n.status <> 'withdrawn'
     ORDER BY n.status = 'pending' DESC, n.created_at DESC LIMIT 100`,
  );
  return rows;
}

async function claim(deps: Deps, id: string, status: 'confirmed' | 'rejected', admin: User) {
  const { rows } = await deps.db.query<{ shop_id: string; months: number; amount_kurus: number; reference: string; user_id: string | null }>(
    `UPDATE payment_notices SET status = $2, handled_at = $3, handled_by = $4 WHERE id = $1 AND status = 'pending'
     RETURNING shop_id, months, amount_kurus, reference, user_id`,
    [id, status, deps.clock.now(), admin.id],
  );
  if (!rows[0]) throw notFound('Payment notice');
  return rows[0];
}

async function tellPayer(deps: Deps, shopId: string, userId: string | null, template: string, body: (shop: string) => string) {
  if (!userId) return;
  const { rows } = await deps.db.query<{ phone: string; name: string }>(
    'SELECT u.phone, s.name FROM users u, shops s WHERE u.id = $1 AND s.id = $2 AND u.deleted_at IS NULL',
    [userId, shopId],
  );
  if (rows[0]) await queueSms(deps.db, deps.clock.now(), { shopId, userId, phone: rows[0].phone, template, body: body(rows[0].name) });
}

/** The transfer is in our account: records the payment, extends the subscription, tells the owner. */
export async function confirmPaymentNotice(deps: Deps, admin: User, id: string) {
  requirePlatformAdmin(admin);
  const n = await claim(deps, id, 'confirmed', admin);
  try {
    const payment = await recordPayment(deps, admin, n.shop_id, {
      amountKurus: n.amount_kurus,
      months: n.months,
      method: 'havale',
      note: `Havale bildirimi · açıklama: ${n.reference}`,
    });
    await deps.db.query('UPDATE payment_notices SET payment_id = $2 WHERE id = $1', [id, payment.id]);
    await tellPayer(deps, n.shop_id, n.user_id, 'payment_confirmed', (shop) => sms.paymentConfirmed({ shop, date: dayMonthYear(payment.periodEnd) }));
    return payment;
  } catch (err) {
    await deps.db.query(`UPDATE payment_notices SET status = 'pending', handled_at = NULL, handled_by = NULL WHERE id = $1`, [id]);
    throw err;
  }
}

/** The transfer cannot be found: the owner is told to check the Açıklama. */
export async function rejectPaymentNotice(deps: Deps, admin: User, id: string) {
  requirePlatformAdmin(admin);
  const n = await claim(deps, id, 'rejected', admin);
  await tellPayer(deps, n.shop_id, n.user_id, 'payment_not_found', (shop) => sms.paymentNotFound({ shop, link: `${deps.config.publicWebUrl}/abonelik/odeme` }));
}

/** Yönetim → salon → "Ödeme isteği gönder": the payment-request SMS to the salon's owner, once a day at most. */
export async function sendPaymentRequest(deps: Deps, admin: User, shopId: string) {
  requirePlatformAdmin(admin);
  const shop = await shopForPayment(deps, shopId);
  if (!shop.plan) throw new AppError(409, 'CUSTOM_PRICE', 'This salon is priced individually');
  const now = deps.clock.now();
  const recent = await deps.db.query(`SELECT 1 FROM notifications WHERE shop_id = $1 AND template = 'payment_request' AND created_at > $2 LIMIT 1`, [
    shopId,
    new Date(now.getTime() - 86_400_000),
  ]);
  if (recent.rowCount) throw new AppError(429, 'ALREADY_SENT_TODAY', 'A payment request was already sent today');
  const owner = await deps.db.query<{ id: string; phone: string }>(
    `SELECT u.id, u.phone FROM shop_members m JOIN users u ON u.id = m.user_id
     WHERE m.shop_id = $1 AND m.owner_label = 'owner' AND m.active AND u.deleted_at IS NULL`,
    [shopId],
  );
  if (!owner.rows[0]) throw notFound('Owner');
  await queueSms(deps.db, now, {
    shopId,
    userId: owner.rows[0].id,
    phone: owner.rows[0].phone,
    template: 'payment_request',
    body: sms.paymentRequest({ shop: shop.name, plan: shop.plan.name, amount: formatPrice(shop.plan.monthlyPriceKurus), link: `${deps.config.publicWebUrl}/abonelik/odeme` }),
  });
  return { sentTo: national(owner.rows[0].phone) };
}
