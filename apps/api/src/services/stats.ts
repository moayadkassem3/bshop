import { DateTime } from 'luxon';
import type { Deps } from '../deps.js';
import { badRequest } from '../errors.js';
import { localDayOf } from '../domain/time.js';
import { requireOwner } from './access.js';
import type { User } from './auth.js';
import { getPublicShopBySlug, getShopById } from './shops.js';

/** Where a visit to a salon's page came from (v1.7). */
export const VIEW_SOURCES = ['kesfet', 'kesimler', 'qr', 'diger'] as const;
export type ViewSource = (typeof VIEW_SOURCES)[number];

/** Counts one visit to a public salon page; only a daily count per source is kept. */
export async function recordShopView(deps: Deps, slug: string, source: ViewSource) {
  const now = deps.clock.now();
  const shop = await getPublicShopBySlug(deps.db, now, slug);
  await deps.db.query(
    `INSERT INTO shop_view_counts (shop_id, day, source, views) VALUES ($1, $2, $3, 1)
     ON CONFLICT (shop_id, day, source) DO UPDATE SET views = shop_view_counts.views + 1`,
    [shop.id, localDayOf(now, shop.timezone).date, source],
  );
}

/**
 * A month of a salon's numbers for its owners: page visits by day and source,
 * and the month's appointments by outcome. Visits run to today; appointments
 * cover the whole month, including those still ahead.
 */
export async function shopStats(deps: Deps, user: User, shopId: string, month?: string) {
  await requireOwner(deps.db, user, shopId);
  const shop = await getShopById(deps.db, shopId);
  const today = DateTime.fromJSDate(deps.clock.now(), { zone: shop.timezone }).startOf('day');
  const start = month ? DateTime.fromFormat(month, 'yyyy-MM', { zone: shop.timezone }) : today.startOf('month');
  if (!start.isValid || start > today) throw badRequest('INVALID_MONTH', 'Use a past or the current month as YYYY-MM');
  const end = start.endOf('month').startOf('day');
  const lastVisitDay = end < today ? end : today;

  const views = await deps.db.query<{ day: string; source: ViewSource; views: number }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, views FROM shop_view_counts
     WHERE shop_id = $1 AND day BETWEEN $2 AND $3`,
    [shopId, start.toISODate(), lastVisitDay.toISODate()],
  );
  const bySource = Object.fromEntries(VIEW_SOURCES.map((s) => [s, 0])) as Record<ViewSource, number>;
  const perDay = new Map<string, number>();
  for (const r of views.rows) {
    bySource[r.source] += r.views;
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.views);
  }
  const daily: { date: string; views: number }[] = [];
  for (let d = start; d <= lastVisitDay; d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    daily.push({ date, views: perDay.get(date) ?? 0 });
  }

  const appts = await deps.db.query<{ status: string; count: number }>(
    `SELECT status, count(*)::int AS count FROM appointments
     WHERE shop_id = $1 AND starts_at >= $2 AND starts_at < $3 GROUP BY status`,
    [shopId, start.toJSDate(), start.plus({ months: 1 }).toJSDate()],
  );
  const count = (...statuses: string[]) => appts.rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r.count, 0);

  return {
    month: start.toFormat('yyyy-MM'),
    today: today.toISODate(),
    views: { total: daily.reduce((n, d) => n + d.views, 0), bySource, daily },
    // Declined requests never became appointments; cancellations are shown on their own.
    appointments: {
      total: count('pending', 'confirmed', 'completed', 'no_show'),
      completed: count('completed'),
      upcoming: count('pending', 'confirmed'),
      noShow: count('no_show'),
      cancelled: count('cancelled'),
    },
  };
}
