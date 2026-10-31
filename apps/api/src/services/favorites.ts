import type { Deps } from '../deps.js';
import { getPublicShopBySlug, PUBLIC_CONDITION } from './shops.js';
import type { User } from './auth.js';

const MAX_FAVORITES = 30;
const SUMMARY_COLUMNS = `s.slug, s.name, s.district, s.city, s.audience, s.verified_at IS NOT NULL AS verified,
  (SELECT p.id FROM shop_photos p WHERE p.shop_id = s.id ORDER BY p.position LIMIT 1) AS cover_photo_id`;

/**
 * "Salonlarım" on the home page: the customer's favourite shops first, then
 * shops they booked before, most recent first. Only shops that are public now.
 */
export async function listCustomerShops(deps: Deps, user: User) {
  const { rows } = await deps.db.query(
    `WITH visits AS (
       SELECT shop_id, max(starts_at) AS last_visit FROM appointments
       WHERE customer_id = $2 AND status IN ('pending', 'confirmed', 'completed')
       GROUP BY shop_id
     )
     SELECT ${SUMMARY_COLUMNS}, (f.user_id IS NOT NULL) AS favorite, v.last_visit
     FROM shops s
     JOIN subscriptions sub ON sub.shop_id = s.id
     LEFT JOIN customer_favorites f ON f.shop_id = s.id AND f.user_id = $2
     LEFT JOIN visits v ON v.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND (f.user_id IS NOT NULL OR v.shop_id IS NOT NULL)
     ORDER BY (f.user_id IS NOT NULL) DESC, f.created_at DESC NULLS LAST, v.last_visit DESC NULLS LAST
     LIMIT 12`,
    [deps.clock.now(), user.id],
  );
  return rows;
}

export async function addFavorite(deps: Deps, user: User, slug: string) {
  const now = deps.clock.now();
  const shop = await getPublicShopBySlug(deps.db, now, slug);
  await deps.db.query(
    `INSERT INTO customer_favorites (user_id, shop_id, created_at)
     SELECT $1, $2, $3 WHERE (SELECT count(*) FROM customer_favorites WHERE user_id = $1) < $4
     ON CONFLICT DO NOTHING`,
    [user.id, shop.id, now, MAX_FAVORITES],
  );
}

export async function removeFavorite(deps: Deps, user: User, slug: string) {
  await deps.db.query(
    'DELETE FROM customer_favorites WHERE user_id = $1 AND shop_id = (SELECT id FROM shops WHERE slug = $2)',
    [user.id, slug],
  );
}

/** Summaries for favourites saved on a signed-out phone. */
export async function shopSummaries(deps: Deps, slugs: string[]) {
  const { rows } = await deps.db.query<{ slug: string }>(
    `SELECT ${SUMMARY_COLUMNS} FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND s.slug = ANY($2::text[])`,
    [deps.clock.now(), slugs],
  );
  // Keep the order the phone saved them in.
  return slugs.map((slug) => rows.find((r) => r.slug === slug)).filter(Boolean);
}
