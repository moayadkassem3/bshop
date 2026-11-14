import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { push } from '../messages.js';
import { queuePush } from '../notifications.js';
import { requireMember, requireOwner } from './access.js';
import type { User } from './auth.js';
import { getPublicShopBySlug } from './shops.js';
import { latestRatings, MIN_RATINGS, RATING_WINDOW_DAYS } from '../domain/ratings.js';

/**
 * A customer rates their own completed visit (v1.7). Rating again within the
 * window changes it. The salon's owners hear about a new rating.
 */
export async function rateVisit(deps: Deps, user: User, appointmentId: string, stars: number) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ id: string; shop_id: string; status: string; starts_at: Date; guest_name: string | null; shop_name: string }>(
      `SELECT a.id, a.shop_id, a.status, a.starts_at, a.guest_name, s.name AS shop_name
       FROM appointments a JOIN shops s ON s.id = a.shop_id WHERE a.id = $1 AND a.customer_id = $2 FOR UPDATE OF a`,
      [appointmentId, user.id],
    );
    const a = rows[0];
    if (!a) throw notFound('Appointment');
    // A guest's visit is theirs to judge, not the booker's.
    if (a.status !== 'completed' || a.guest_name) throw conflict('NOT_RATEABLE', 'Only your own completed visits can be rated');
    if (now.getTime() - a.starts_at.getTime() > RATING_WINDOW_DAYS * 86_400_000) throw conflict('RATING_CLOSED', 'The rating period has ended');

    const saved = await tx.query<{ id: string; created: boolean }>(
      `INSERT INTO shop_ratings (shop_id, appointment_id, customer_id, stars, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (appointment_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = EXCLUDED.updated_at
       RETURNING id, (xmax = 0) AS created`,
      [a.shop_id, a.id, user.id, stars, now],
    );
    if (saved.rows[0]!.created) {
      const owners = await tx.query<{ user_id: string }>("SELECT user_id FROM shop_members WHERE shop_id = $1 AND role = 'owner' AND active", [a.shop_id]);
      await queuePush(tx, now, {
        shopId: a.shop_id,
        appointmentId: a.id,
        userIds: owners.rows.map((r) => r.user_id),
        template: 'new_rating',
        ...push.newRating({ stars }),
        data: { kind: 'rating' },
      });
    }
    return { id: saved.rows[0]!.id, stars };
  });
}

type RatingRow = { id: string; stars: number; created_at: Date; updated_at: Date; reply: string | null; replied_at: Date | null; customer: string };

/** "Ayşe K." from the customer's name; deleted accounts and missing names read "Müşteri". */
const CUSTOMER_LABEL = `CASE WHEN u.deleted_at IS NOT NULL OR u.first_name IS NULL THEN 'Müşteri'
  ELSE u.first_name || COALESCE(' ' || left(u.last_name, 1) || '.', '') END`;

async function summary(q: Deps['db'], shopId: string) {
  const { rows } = await q.query<{ stars: number; n: number }>(
    `SELECT x.stars, count(*)::int AS n FROM (${latestRatings('$1')}) x GROUP BY x.stars`,
    [shopId],
  );
  const count = rows.reduce((sum, r) => sum + r.n, 0);
  const average = count ? Math.round((rows.reduce((sum, r) => sum + r.n * r.stars, 0) / count) * 10) / 10 : null;
  return {
    count,
    average,
    rating: count >= MIN_RATINGS ? average : null,
    /** How many customers gave 5, 4, 3, 2 and 1 stars. */
    distribution: [5, 4, 3, 2, 1].map((stars) => rows.find((r) => r.stars === stars)?.n ?? 0),
  };
}

async function recent(q: Deps['db'], shopId: string, limit: number) {
  const { rows } = await q.query<RatingRow>(
    `SELECT DISTINCT ON (r.customer_id) r.id, r.stars, r.created_at, r.updated_at, r.reply, r.replied_at, ${CUSTOMER_LABEL} AS customer
     FROM shop_ratings r JOIN users u ON u.id = r.customer_id
     WHERE r.shop_id = $1 AND r.hidden_at IS NULL ORDER BY r.customer_id, r.updated_at DESC`,
    [shopId],
  );
  return rows.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime()).slice(0, limit);
}

/** The salon page: the summary, and the latest ratings with the salon's replies. */
export async function publicRatings(deps: Deps, slug: string) {
  const shop = await getPublicShopBySlug(deps.db, deps.clock.now(), slug);
  // Below the minimum, customers see the ratings but no average.
  const { average: _average, ...shown } = await summary(deps.db, shop.id);
  return { ...shown, ratings: await recent(deps.db, shop.id, 20) };
}

/** Değerlendirmeler for the salon's team: the same, with the true count even below MIN_RATINGS. */
export async function shopRatings(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  return { ...(await summary(deps.db, shopId)), minimum: MIN_RATINGS, ratings: await recent(deps.db, shopId, 100) };
}

/** An owner's public answer to a rating; an empty text removes it. */
export async function replyToRating(deps: Deps, user: User, shopId: string, ratingId: string, text: string | null) {
  await requireOwner(deps.db, user, shopId);
  const { rowCount } = await deps.db.query(
    `UPDATE shop_ratings SET reply = $3::text, replied_at = CASE WHEN $3::text IS NULL THEN NULL ELSE $4::timestamptz END
     WHERE id = $2 AND shop_id = $1 AND hidden_at IS NULL`,
    [shopId, ratingId, text, deps.clock.now()],
  );
  if (!rowCount) throw notFound('Rating');
}
