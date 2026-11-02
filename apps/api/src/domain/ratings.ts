/**
 * Salon ratings (v1.7): 1–5 stars from customers of completed visits. A salon's
 * average counts each customer's latest rating once, and is shown only once
 * MIN_RATINGS customers have rated.
 */

/** A visit can be rated for this long after it starts. */
export const RATING_WINDOW_DAYS = 14;
/** The average is shown once this many customers have rated (fewer would mislead). */
export const MIN_RATINGS = 3;

/** Each customer's latest visible rating of the shop `shopRef` (a column or parameter). */
export const latestRatings = (shopRef: string) => `SELECT DISTINCT ON (r.customer_id) r.stars FROM shop_ratings r
  WHERE r.shop_id = ${shopRef} AND r.hidden_at IS NULL ORDER BY r.customer_id, r.updated_at DESC`;

/** For shop queries aliased `s`: `rating` (null below MIN_RATINGS) and `rating_count`. */
export const RATING_COLUMNS = `(SELECT CASE WHEN count(*) >= ${MIN_RATINGS} THEN round(avg(x.stars), 1)::float END FROM (${latestRatings('s.id')}) x) AS rating,
  (SELECT count(*)::int FROM (${latestRatings('s.id')}) x) AS rating_count`;
