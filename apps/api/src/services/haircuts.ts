import { randomUUID } from 'node:crypto';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { HAIRCUT_STYLES, stylesFor } from '../domain/styles.js';
import { requireMember } from './access.js';
import type { User } from './auth.js';
import { processImage } from './photos.js';
import { PUBLIC_CONDITION } from './shops.js';

export const MAX_POSTS_PER_SHOP = 200;

export type HaircutPost = {
  id: string;
  style: string;
  style_name: string;
  caption: string | null;
  width: number;
  height: number;
  created_at: Date;
  like_count: number;
};

const styleName = (key: string) => HAIRCUT_STYLES.find((s) => s.key === key)?.name ?? key;
const withStyleName = <T extends { style: string }>(row: T) => ({ ...row, style_name: styleName(row.style) });

const POST_COLUMNS = `p.id, p.style, p.caption, p.width, p.height, p.created_at,
  (SELECT count(*)::int FROM haircut_likes l WHERE l.post_id = p.id) AS like_count`;

/** Owners and staff post their work; staff showcase their own cuts. */
export async function addPost(deps: Deps, user: User, shopId: string, data: Buffer, input: { style: string; caption?: string | null }) {
  await requireMember(deps.db, user, shopId);
  const processed = await processImage(data, 'post');
  const key = `${shopId}/posts/${randomUUID()}.webp`;
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shops WHERE id = $1 FOR UPDATE', [shopId]);
    const { rows } = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM haircut_posts WHERE shop_id = $1', [shopId]);
    if (rows[0]!.n >= MAX_POSTS_PER_SHOP) throw conflict('POST_LIMIT', `A shop can have up to ${MAX_POSTS_PER_SHOP} posts`);
    await deps.photos.put(key, processed.data);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO haircut_posts (shop_id, author_user_id, style, caption, storage_key, width, height, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [shopId, user.id, input.style, input.caption?.trim() || null, key, processed.info.width, processed.info.height, deps.clock.now()],
    );
    return { id: inserted.rows[0]!.id };
  });
}

/** Owners remove any post of the shop; staff remove their own. */
export async function deletePost(deps: Deps, user: User, shopId: string, postId: string) {
  const member = await requireMember(deps.db, user, shopId);
  const { rows } = await deps.db.query<{ author_user_id: string | null; storage_key: string }>(
    'SELECT author_user_id, storage_key FROM haircut_posts WHERE id = $1 AND shop_id = $2',
    [postId, shopId],
  );
  const post = rows[0];
  if (!post) throw notFound('Post');
  if (member.role !== 'owner' && post.author_user_id !== user.id) throw forbidden('Only the owner or the author can remove a post');
  await deps.db.query('DELETE FROM haircut_posts WHERE id = $1', [postId]);
  await deps.photos.delete(post.storage_key);
}

export async function listShopPostsForStaff(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  return listShopPosts(deps, shopId, MAX_POSTS_PER_SHOP);
}

/** A shop's work, newest first (its profile page shows the latest). */
export async function listShopPosts(deps: Deps, shopId: string, limit = 12): Promise<HaircutPost[]> {
  const { rows } = await deps.db.query<Omit<HaircutPost, 'style_name'>>(
    `SELECT ${POST_COLUMNS} FROM haircut_posts p WHERE p.shop_id = $1 ORDER BY p.created_at DESC LIMIT $2`,
    [shopId, limit],
  );
  return rows.map(withStyleName);
}

/**
 * Popüler kesimler: posts from public shops, ranked by likes with newer posts
 * favoured (likes divided by age, so last month's hit gives way to this week's).
 */
export async function popularPosts(deps: Deps, input: { audience?: 'men' | 'women'; style?: string; limit?: number }) {
  const styles = input.style ? [input.style] : input.audience ? stylesFor(input.audience) : null;
  const { rows } = await deps.db.query<Omit<HaircutPost, 'style_name'> & { shop_name: string; shop_slug: string; district: string | null; city: string | null }>(
    `SELECT ${POST_COLUMNS}, s.name AS shop_name, s.slug AS shop_slug, s.district, s.city
     FROM haircut_posts p JOIN shops s ON s.id = p.shop_id JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND ($2::text[] IS NULL OR p.style = ANY($2))
     ORDER BY (1 + (SELECT count(*) FROM haircut_likes l WHERE l.post_id = p.id))
       / power(extract(epoch FROM ($1 - p.created_at)) / 3600 + 2, 1.2) DESC, p.created_at DESC
     LIMIT $3`,
    [deps.clock.now(), styles, input.limit ?? 30],
  );
  return rows.map(withStyleName);
}

async function requireVisiblePost(deps: Deps, postId: string) {
  const { rowCount } = await deps.db.query(
    `SELECT 1 FROM haircut_posts p JOIN shops s ON s.id = p.shop_id JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND p.id = $2`,
    [deps.clock.now(), postId],
  );
  if (!rowCount) throw notFound('Post');
}

export async function likePost(deps: Deps, user: User, postId: string) {
  await requireVisiblePost(deps, postId);
  await deps.db.query('INSERT INTO haircut_likes (post_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [
    postId,
    user.id,
    deps.clock.now(),
  ]);
}

export async function unlikePost(deps: Deps, user: User, postId: string) {
  await deps.db.query('DELETE FROM haircut_likes WHERE post_id = $1 AND user_id = $2', [postId, user.id]);
}

export async function likedPostIds(deps: Deps, user: User): Promise<string[]> {
  const { rows } = await deps.db.query<{ post_id: string }>('SELECT post_id FROM haircut_likes WHERE user_id = $1', [user.id]);
  return rows.map((r) => r.post_id);
}

export async function readPostPhoto(deps: Deps, postId: string): Promise<Buffer> {
  const { rows } = await deps.db.query<{ storage_key: string }>('SELECT storage_key FROM haircut_posts WHERE id = $1', [postId]);
  const data = rows[0] ? await deps.photos.get(rows[0].storage_key) : null;
  if (!data) throw notFound('Photo');
  return data;
}
