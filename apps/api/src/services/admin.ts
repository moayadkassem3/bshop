import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { notFound } from '../errors.js';
import { PLANS, planForStaff } from '../domain/plans.js';
import { RATING_COLUMNS } from '../domain/ratings.js';
import { normalizePhone } from '../phone.js';
import { requirePlatformAdmin } from './access.js';
import type { User } from './auth.js';
import { PUBLIC_CONDITION } from './shops.js';

/**
 * Admin panel (/yonetim, v1.7). Salons go live when they register; our team uses
 * this to follow the business (salons, payments, bookings), record payments
 * until online payment exists, and take down spam or misleading salons.
 */

/**
 * Our team's phone numbers (ADMIN_PHONES) become admins at start-up; a missing
 * account is created. When the list is set it is complete: anyone else loses
 * admin rights (security, v1.7), such as the test admin the seed script adds.
 */
export async function ensureAdmins(deps: Deps) {
  if (!deps.config.adminPhones.length) return;
  const phones = deps.config.adminPhones.map(normalizePhone);
  await deps.db.query('UPDATE users SET is_platform_admin = false WHERE is_platform_admin AND phone <> ALL($1::text[])', [phones]);
  for (const raw of deps.config.adminPhones) {
    const phone = normalizePhone(raw);
    await deps.db.query(
      `INSERT INTO users (phone, is_platform_admin) VALUES ($1, true)
       ON CONFLICT (phone) DO UPDATE SET is_platform_admin = true`,
      [phone],
    );
  }
}

const SEATS = `(SELECT count(*)::int FROM shop_members b WHERE b.shop_id = s.id AND b.active AND b.bookable)`;

/** Özet: the numbers that matter this month. */
export async function adminOverview(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const now = deps.clock.now();
  const q = <T extends pg.QueryResultRow>(sql: string, params: unknown[] = [now]) => deps.db.query<T>(sql, params).then((r) => r.rows[0]!);

  const salons = await q<Record<string, number>>(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE ${PUBLIC_CONDITION})::int AS live,
       count(*) FILTER (WHERE ${PUBLIC_CONDITION} AND sub.status = 'trial')::int AS trial,
       count(*) FILTER (WHERE sub.status = 'active' AND s.suspended_at IS NULL)::int AS paying,
       count(*) FILTER (WHERE sub.status = 'past_due' AND s.suspended_at IS NULL)::int AS late,
       count(*) FILTER (WHERE NOT (${PUBLIC_CONDITION}) AND s.suspended_at IS NULL)::int AS hidden,
       count(*) FILTER (WHERE s.suspended_at IS NOT NULL)::int AS suspended,
       count(*) FILTER (WHERE s.checked_at IS NULL AND s.suspended_at IS NULL)::int AS unchecked,
       count(*) FILTER (WHERE s.created_at > $1::timestamptz - interval '7 days')::int AS new_7d,
       count(*) FILTER (WHERE s.created_at > $1::timestamptz - interval '30 days')::int AS new_30d
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id`,
  );
  // Monthly recurring revenue: what paying salons' plans add up to at today's staff counts.
  const paying = await deps.db.query<{ seats: number; status: string }>(
    `SELECT ${SEATS} AS seats, sub.status FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE sub.status IN ('active', 'past_due') AND s.suspended_at IS NULL`,
  );
  const active = paying.rows.filter((r) => r.status === 'active');
  const mrrKurus = active.reduce((sum, r) => sum + (planForStaff(r.seats)?.monthlyPriceKurus ?? 0), 0);
  // Subscribed salons (founder, v1.7): active or late within their grace, by plan.
  const subscribers = {
    total: paying.rows.length,
    late: paying.rows.length - active.length,
    byPlan: [...PLANS.map((p) => ({ name: p.name, count: 0 })), { name: '10+ personel (teklif)', count: 0 }],
  };
  for (const r of paying.rows) {
    const i = PLANS.findIndex((p) => p.id === planForStaff(r.seats)?.id);
    subscribers.byPlan[i === -1 ? PLANS.length : i]!.count++;
  }
  const payments = await q<{ this_month: number; last_month: number }>(
    `SELECT COALESCE(sum(amount_kurus) FILTER (WHERE created_at >= date_trunc('month', $1::timestamptz AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)::int AS this_month,
       COALESCE(sum(amount_kurus) FILTER (WHERE created_at >= date_trunc('month', ($1::timestamptz AT TIME ZONE 'Europe/Istanbul') - interval '1 month') AT TIME ZONE 'Europe/Istanbul'
         AND created_at < date_trunc('month', $1::timestamptz AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)::int AS last_month
     FROM payments`,
  );
  const bookings = await q<Record<string, number>>(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE status = 'completed')::int AS completed,
       count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
     FROM appointments WHERE source = 'online' AND created_at > $1::timestamptz - interval '30 days'`,
  );
  const customers = await q<Record<string, number>>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE u.created_at > $1::timestamptz - interval '30 days')::int AS new_30d
     FROM users u WHERE u.deleted_at IS NULL AND NOT u.is_platform_admin
       AND NOT EXISTS (SELECT 1 FROM shop_members m WHERE m.user_id = u.id)`,
  );
  const ratings = await q<{ count: number; average: number | null }>(
    `SELECT count(*)::int AS count, round(avg(stars), 1)::float AS average FROM shop_ratings
     WHERE hidden_at IS NULL AND updated_at > $1::timestamptz - interval '30 days'`,
  );
  const open = await q<{ subscriptions: number; quotes: number; payments: number }>(
    `SELECT (SELECT count(DISTINCT shop_id)::int FROM subscription_requests WHERE handled_at IS NULL) AS subscriptions,
       (SELECT count(*)::int FROM payment_notices WHERE status = 'pending') AS payments,
       (SELECT count(*)::int FROM quote_requests WHERE status = 'new') AS quotes`,
    [],
  );
  return { salons, subscribers, mrrKurus, payments, bookings, customers, ratings, open };
}

export type AdminShopFilter = 'tumu' | 'yeni' | 'deneme' | 'aktif' | 'odeme' | 'kapali';

const FILTERS: Record<AdminShopFilter, string> = {
  tumu: 'true',
  // New and not yet looked at by our team.
  yeni: 's.checked_at IS NULL AND s.suspended_at IS NULL',
  deneme: `sub.status = 'trial' AND s.suspended_at IS NULL`,
  aktif: `sub.status = 'active' AND s.suspended_at IS NULL`,
  // Waiting on money: asked to subscribe, late, or hidden after the trial or a lapse.
  odeme: `s.suspended_at IS NULL AND (sub.status = 'past_due' OR NOT (${PUBLIC_CONDITION})
    OR EXISTS (SELECT 1 FROM subscription_requests r WHERE r.shop_id = s.id AND r.handled_at IS NULL))`,
  kapali: 's.suspended_at IS NOT NULL',
};

const SHOP_ROW = `s.id, s.slug, s.name, s.district, s.city, s.audience, s.created_at, s.checked_at, s.suspended_at, s.suspended_reason,
  sub.status AS subscription_status, sub.current_period_end, sub.grace_until, (${PUBLIC_CONDITION}) AS visible, ${SEATS} AS seats,
  ${RATING_COLUMNS},
  o.display_name AS owner_name, ou.phone AS owner_phone,
  (SELECT count(*)::int FROM appointments a WHERE a.shop_id = s.id AND a.source = 'online' AND a.created_at > $1::timestamptz - interval '30 days') AS bookings_30d,
  (SELECT COALESCE(sum(v.views), 0)::int FROM shop_view_counts v WHERE v.shop_id = s.id AND v.day > ($1::timestamptz - interval '30 days')::date) AS views_30d,
  (SELECT max(r.created_at) FROM subscription_requests r WHERE r.shop_id = s.id AND r.handled_at IS NULL) AS open_request_at,
  (SELECT max(p.created_at) FROM payments p WHERE p.shop_id = s.id) AS last_payment_at`;

const SHOP_FROM = `shops s JOIN subscriptions sub ON sub.shop_id = s.id
  LEFT JOIN shop_members o ON o.shop_id = s.id AND o.owner_label = 'owner' AND o.active
  LEFT JOIN users ou ON ou.id = o.user_id`;

const withPlan = <T extends { seats: number }>(r: T) => ({ ...r, plan: planForStaff(r.seats) });

/** Salonlar: every salon, newest first, filtered and searched by name, place or owner phone. */
export async function adminShops(deps: Deps, admin: User, input: { filter: AdminShopFilter; q?: string }) {
  requirePlatformAdmin(admin);
  const text = input.q?.trim() ? `%${input.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const { rows } = await deps.db.query<{ seats: number }>(
    `SELECT ${SHOP_ROW} FROM ${SHOP_FROM}
     WHERE (${FILTERS[input.filter]})
       AND ($2::text IS NULL OR s.name ILIKE $2 OR s.slug ILIKE $2 OR s.district ILIKE $2 OR s.city ILIKE $2 OR ou.phone ILIKE $2)
     ORDER BY s.created_at DESC LIMIT 300`,
    [deps.clock.now(), text],
  );
  return rows.map(withPlan);
}

/** One salon: the row, its team, payments and subscription requests. */
export async function adminShop(deps: Deps, admin: User, shopId: string) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query<{ seats: number }>(`SELECT ${SHOP_ROW}, s.address, s.phone FROM ${SHOP_FROM} WHERE s.id = $2`, [deps.clock.now(), shopId]);
  if (!rows[0]) throw notFound('Shop');
  const members = await deps.db.query(
    `SELECT m.display_name, m.role, m.owner_label, m.bookable, m.active, u.phone FROM shop_members m JOIN users u ON u.id = m.user_id
     WHERE m.shop_id = $1 ORDER BY m.active DESC, m.created_at`,
    [shopId],
  );
  const payments = await deps.db.query(
    `SELECT p.id, p.amount_kurus, p.months, p.method, p.note, p.period_end, p.created_at, COALESCE(u.first_name, u.phone) AS recorded_by
     FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE p.shop_id = $1 ORDER BY p.created_at DESC`,
    [shopId],
  );
  const requests = await deps.db.query(
    `SELECT r.id, r.plan_id, r.created_at, r.handled_at, u.phone FROM subscription_requests r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.shop_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
    [shopId],
  );
  return { ...withPlan(rows[0]), members: members.rows, payments: payments.rows, requests: requests.rows };
}

/** 'yok': activated without a payment (free month, pay later), recorded with amount 0 (v1.7). */
export type PaymentInput = { amountKurus: number; months: number; method: 'havale' | 'nakit' | 'kart' | 'diger' | 'yok'; note?: string | null };

/**
 * Records a payment and extends the paid period by `months`: from the current
 * period's end while it runs, otherwise from today. Open "Aboneliği başlat"
 * requests are closed.
 */
export async function recordPayment(deps: Deps, admin: User, shopId: string, input: PaymentInput) {
  requirePlatformAdmin(admin);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ status: string; current_period_end: Date | null }>(
      'SELECT status, current_period_end FROM subscriptions WHERE shop_id = $1 FOR UPDATE',
      [shopId],
    );
    const sub = rows[0];
    if (!sub) throw notFound('Shop');
    const from = sub.status === 'active' && sub.current_period_end && sub.current_period_end > now ? sub.current_period_end : now;
    const end = (await tx.query<{ end: Date }>('SELECT $1::timestamptz + make_interval(months => $2) AS end', [from, input.months])).rows[0]!.end;
    const payment = await tx.query<{ id: string }>(
      `INSERT INTO payments (shop_id, amount_kurus, months, method, note, period_end, recorded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [shopId, input.method === 'yok' ? 0 : input.amountKurus, input.months, input.method, input.note || null, end, admin.id, now],
    );
    await tx.query(
      `UPDATE subscriptions SET status = 'active', current_period_end = $2, grace_until = NULL, updated_at = $3 WHERE shop_id = $1`,
      [shopId, end, now],
    );
    await tx.query('UPDATE subscription_requests SET handled_at = $2 WHERE shop_id = $1 AND handled_at IS NULL', [shopId, now]);
    return { id: payment.rows[0]!.id, periodEnd: end };
  });
}

/** Gives a salon more trial days (sales: "one more week to try it"). */
export async function extendTrial(deps: Deps, admin: User, shopId: string, days: number) {
  requirePlatformAdmin(admin);
  const now = deps.clock.now();
  const { rowCount } = await deps.db.query(
    `UPDATE subscriptions SET status = 'trial', grace_until = NULL, updated_at = $3,
       current_period_end = GREATEST(COALESCE(current_period_end, $3), $3) + make_interval(days => $2)
     WHERE shop_id = $1 AND status IN ('trial', 'none')`,
    [shopId, days, now],
  );
  if (!rowCount) throw notFound('Shop on trial');
}

/** Ends a subscription (the salon left, or stopped paying for good). */
export async function cancelSubscription(deps: Deps, admin: User, shopId: string) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query(
    `UPDATE subscriptions SET status = 'canceled', grace_until = NULL, updated_at = $2 WHERE shop_id = $1`,
    [shopId, deps.clock.now()],
  );
  if (!rowCount) throw notFound('Shop');
}

/** "Kontrol edildi": someone in our team looked at a new salon and found nothing wrong (or undoes it). */
export async function markChecked(deps: Deps, admin: User, shopId: string, checked: boolean) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query(
    `UPDATE shops SET checked_at = CASE WHEN $2 THEN $3::timestamptz END, checked_by = CASE WHEN $2 THEN $4::uuid END WHERE id = $1`,
    [shopId, checked, deps.clock.now(), admin.id],
  );
  if (!rowCount) throw notFound('Shop');
}

/** "Yayından kaldır": hides a spam or misleading salon everywhere; its team sees why. Null reason puts it back. */
export async function suspendShop(deps: Deps, admin: User, shopId: string, reason: string | null) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query(
    `UPDATE shops SET suspended_at = CASE WHEN $2::text IS NULL THEN NULL ELSE $3::timestamptz END, suspended_reason = $2::text,
       checked_at = COALESCE(checked_at, $3::timestamptz), checked_by = COALESCE(checked_by, $4::uuid)
     WHERE id = $1`,
    [shopId, reason, deps.clock.now(), admin.id],
  );
  if (!rowCount) throw notFound('Shop');
}

/** Talepler: "Aboneliği başlat" requests (open first) and custom-price requests. */
export async function adminRequests(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const subscriptions = await deps.db.query<{ seats: number; handled_at: Date | null; created_at: Date }>(
    `SELECT DISTINCT ON (r.shop_id) r.id, r.shop_id, r.created_at, r.handled_at, s.name AS shop_name, s.slug, s.city, s.district,
       sub.status AS subscription_status, ${SEATS} AS seats, u.phone, COALESCE(u.first_name || ' ' || u.last_name, '') AS requester
     FROM subscription_requests r JOIN shops s ON s.id = r.shop_id JOIN subscriptions sub ON sub.shop_id = s.id
     LEFT JOIN users u ON u.id = r.user_id
     ORDER BY r.shop_id, r.created_at DESC`,
  );
  const sorted = subscriptions.rows
    .map(withPlan)
    // Open requests first, newest first.
    .sort((a, b) => Number(Boolean(a.handled_at)) - Number(Boolean(b.handled_at)) || +b.created_at - +a.created_at)
    .slice(0, 100);
  const quotes = await deps.db.query(
    `SELECT id, salon_name, contact_name, phone, email, staff_count, branch_count, city, message, source, status, created_at
     FROM quote_requests ORDER BY status = 'new' DESC, created_at DESC LIMIT 100`,
  );
  return { subscriptions: sorted, quotes: quotes.rows, plans: PLANS };
}

export async function setQuoteStatus(deps: Deps, admin: User, id: string, status: 'new' | 'contacted' | 'closed') {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query('UPDATE quote_requests SET status = $2 WHERE id = $1', [id, status]);
  if (!rowCount) throw notFound('Quote request');
}

/** Değerlendirmeler: the latest ratings everywhere (or only 1–2 stars), to spot fake or abusive ones. */
export async function adminRatings(deps: Deps, admin: User, input: { low: boolean }) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query(
    `SELECT r.id, r.stars, r.updated_at, r.reply, r.hidden_at, s.name AS shop_name, s.slug,
       CASE WHEN u.deleted_at IS NOT NULL THEN 'Silinmiş hesap' ELSE COALESCE(u.first_name || ' ' || u.last_name, 'Müşteri') END AS customer,
       CASE WHEN u.deleted_at IS NULL THEN u.phone END AS customer_phone,
       (SELECT count(*)::int FROM shop_ratings x WHERE x.customer_id = r.customer_id) AS customer_ratings
     FROM shop_ratings r JOIN shops s ON s.id = r.shop_id JOIN users u ON u.id = r.customer_id
     WHERE ($1::boolean IS FALSE OR r.stars <= 2)
     ORDER BY r.updated_at DESC LIMIT 200`,
    [input.low],
  );
  return rows;
}

export async function hideRating(deps: Deps, admin: User, id: string, hidden: boolean) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query('UPDATE shop_ratings SET hidden_at = CASE WHEN $2 THEN $3::timestamptz END WHERE id = $1', [
    id,
    hidden,
    deps.clock.now(),
  ]);
  if (!rowCount) throw notFound('Rating');
}
