import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { requireMember, requireOwner } from './access.js';
import type { User } from './auth.js';

export const MAX_PHOTOS = 12;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type Photo = { id: string; width: number; height: number };

/**
 * How uploads are stored (v1.7). Shop photos open full screen in the gallery;
 * haircut posts are only ever shown at phone width, so they are kept smaller.
 * WebP at quality 78 looks the same as the original on a phone and is about a
 * tenth of a phone camera's JPEG. A very detailed photo (hair, patterned walls)
 * that still comes out above `maxBytes` is encoded once more at `minQuality`;
 * quality never goes below that, so nothing turns blocky.
 */
export const IMAGE_PRESETS = {
  photo: { maxSide: 1600, quality: 78, minQuality: 70, maxBytes: 300 * 1024 },
  post: { maxSide: 1280, quality: 78, minQuality: 70, maxBytes: 220 * 1024 },
} as const;
export type ImageKind = keyof typeof IMAGE_PRESETS;

/**
 * Every upload is re-encoded: turned upright, scaled down to the preset's size,
 * and saved as WebP without its metadata, so a phone photo's hidden GPS
 * location never reaches the public page.
 */
export async function processImage(data: Buffer, kind: ImageKind = 'photo'): Promise<{ data: Buffer; info: { width: number; height: number } }> {
  const preset = IMAGE_PRESETS[kind];
  try {
    const upright = await sharp(data, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: preset.maxSide, height: preset.maxSide, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const encode = (quality: number) =>
      sharp(upright.data, { raw: upright.info })
        .webp({ quality, effort: 5, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
    let out = await encode(preset.quality);
    if (out.data.length > preset.maxBytes) out = await encode(preset.minQuality);
    return { data: out.data, info: { width: out.info.width, height: out.info.height } };
  } catch {
    throw badRequest('INVALID_IMAGE', 'Upload a JPEG, PNG, or WebP photo');
  }
}

export async function addPhoto(deps: Deps, user: User, shopId: string, data: Buffer): Promise<Photo> {
  await requireOwner(deps.db, user, shopId);
  const processed = await processImage(data);
  const key = `${shopId}/${randomUUID()}.webp`;
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shops WHERE id = $1 FOR UPDATE', [shopId]);
    const { rows } = await tx.query<{ n: number; next: number }>(
      'SELECT count(*)::int AS n, COALESCE(max(position), 0) + 1 AS next FROM shop_photos WHERE shop_id = $1',
      [shopId],
    );
    if (rows[0]!.n >= MAX_PHOTOS) throw conflict('PHOTO_LIMIT', `A shop can have up to ${MAX_PHOTOS} photos`);
    await deps.photos.put(key, processed.data);
    const inserted = await tx.query<Photo>(
      `INSERT INTO shop_photos (shop_id, storage_key, width, height, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, width, height`,
      [shopId, key, processed.info.width, processed.info.height, rows[0]!.next],
    );
    return inserted.rows[0]!;
  });
}

export async function deletePhoto(deps: Deps, user: User, shopId: string, photoId: string) {
  await requireOwner(deps.db, user, shopId);
  const { rows } = await deps.db.query<{ storage_key: string }>(
    'DELETE FROM shop_photos WHERE id = $1 AND shop_id = $2 RETURNING storage_key',
    [photoId, shopId],
  );
  if (!rows[0]) throw notFound('Photo');
  await deps.photos.delete(rows[0].storage_key);
}

/** The first photo is the cover on the profile page. */
export async function reorderPhotos(deps: Deps, user: User, shopId: string, photoIds: string[]) {
  await requireOwner(deps.db, user, shopId);
  await withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM shop_photos WHERE shop_id = $1', [shopId]);
    const current = new Set(rows.map((r) => r.id));
    if (photoIds.length !== current.size || !photoIds.every((id) => current.has(id))) {
      throw badRequest('PHOTO_ORDER', 'List every photo of the shop exactly once');
    }
    for (const [i, id] of photoIds.entries()) {
      await tx.query('UPDATE shop_photos SET position = $2 WHERE id = $1', [id, i + 1]);
    }
  });
}

export async function listPhotos(deps: Deps, shopId: string): Promise<Photo[]> {
  const { rows } = await deps.db.query<Photo>(
    'SELECT id, width, height FROM shop_photos WHERE shop_id = $1 ORDER BY position',
    [shopId],
  );
  return rows;
}

export async function listPhotosForStaff(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  return listPhotos(deps, shopId);
}

export async function readPhoto(deps: Deps, photoId: string): Promise<Buffer> {
  const { rows } = await deps.db.query<{ storage_key: string }>('SELECT storage_key FROM shop_photos WHERE id = $1', [photoId]);
  const data = rows[0] ? await deps.photos.get(rows[0].storage_key) : null;
  if (!data) throw notFound('Photo');
  return data;
}
