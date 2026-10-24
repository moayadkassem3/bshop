import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { normalizePhone } from '../phone.js';
import { requireOwner, requirePlatformAdmin } from './access.js';
import { upsertUserByPhone, type User } from './auth.js';

export type Shop = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  audience: 'men' | 'women' | 'unisex';
  cancellation_cutoff_minutes: number;
  min_lead_minutes: number;
  buffer_minutes: number;
  slot_step_minutes: number;
  booking_horizon_days: number;
  max_future_bookings: number;
  reviewed_at: Date | null;
};

const SHOP_COLUMNS = `s.id, s.slug, s.name, s.phone, s.address, s.latitude, s.longitude, s.timezone, s.audience,
  s.cancellation_cutoff_minutes, s.min_lead_minutes, s.buffer_minutes, s.slot_step_minutes,
  s.booking_horizon_days, s.max_future_bookings, s.reviewed_at`;

/** Public = reviewed by our team and paid up (trial, active, or past due within the grace period). */
const PUBLIC_CONDITION = `s.reviewed_at IS NOT NULL AND (
  sub.status IN ('trial', 'active') OR (sub.status = 'past_due' AND sub.grace_until > $1))`;

export async function getShopById(q: Queryable, shopId: string): Promise<Shop> {
  const { rows } = await q.query<Shop>(`SELECT ${SHOP_COLUMNS} FROM shops s WHERE s.id = $1`, [shopId]);
  if (!rows[0]) throw notFound('Shop');
  return rows[0];
}

/** A shop customers can see and book, or 404 (inactive shops are indistinguishable from missing ones). */
export async function getPublicShopBySlug(q: Queryable, now: Date, slug: string): Promise<Shop> {
  const { rows } = await q.query<Shop>(
    `SELECT ${SHOP_COLUMNS} FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND s.slug = $2`,
    [now, slug],
  );
  if (!rows[0]) throw notFound('Shop');
  return rows[0];
}

export async function listPublicShops(
  deps: Deps,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const { rows } = await deps.db.query(
    `SELECT s.slug, s.name, s.address, s.latitude, s.longitude, s.audience
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION}
       AND s.latitude BETWEEN $2 AND $3 AND s.longitude BETWEEN $4 AND $5
     ORDER BY s.name LIMIT 200`,
    [deps.clock.now(), box.minLat, box.maxLat, box.minLng, box.maxLng],
  );
  return rows;
}

/** Home-page search by shop name or address. */
export async function searchPublicShops(deps: Deps, query: string) {
  const { rows } = await deps.db.query(
    `SELECT s.slug, s.name, s.address, s.latitude, s.longitude, s.audience
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND (s.name ILIKE $2 OR s.address ILIKE $2)
     ORDER BY s.name LIMIT 20`,
    [deps.clock.now(), `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`],
  );
  return rows;
}

export type CreateShopInput = {
  name: string;
  slug: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  audience?: Shop['audience'];
  owner: { phone: string; firstName: string; lastName: string; displayName: string; bookable: boolean };
};

/** Our team creates the shop and its owner during the face-to-face visit. */
export async function createShop(deps: Deps, admin: User, input: CreateShopInput) {
  requirePlatformAdmin(admin);
  return withTx(deps.db, async (tx) => {
    const exists = await tx.query('SELECT 1 FROM shops WHERE slug = $1', [input.slug]);
    if (exists.rowCount) throw conflict('SLUG_TAKEN', 'This shop link is already used');
    const shop = (
      await tx.query<{ id: string }>(
        `INSERT INTO shops (name, slug, phone, address, latitude, longitude, audience)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          input.name,
          input.slug,
          input.phone ? normalizePhone(input.phone) : null,
          input.address ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.audience ?? 'men',
        ],
      )
    ).rows[0]!;
    await tx.query('INSERT INTO subscriptions (shop_id) VALUES ($1)', [shop.id]);
    const ownerId = await upsertUserByPhone(
      tx,
      normalizePhone(input.owner.phone),
      input.owner.firstName,
      input.owner.lastName,
    );
    const member = (
      await tx.query<{ id: string }>(
        `INSERT INTO shop_members (shop_id, user_id, role, display_name, bookable)
         VALUES ($1, $2, 'owner', $3, $4) RETURNING id`,
        [shop.id, ownerId, input.owner.displayName, input.owner.bookable],
      )
    ).rows[0]!;
    return { shopId: shop.id, ownerMemberId: member.id };
  });
}

export async function markReviewed(deps: Deps, admin: User, shopId: string) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query('UPDATE shops SET reviewed_at = $2, reviewed_by = $3 WHERE id = $1', [
    shopId,
    deps.clock.now(),
    admin.id,
  ]);
  if (!rowCount) throw notFound('Shop');
}

export type SubscriptionInput = {
  status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd?: Date | null;
  graceUntil?: Date | null;
};

/** Set by our team for now; the iyzico integration will drive this later. */
export async function setSubscription(deps: Deps, admin: User, shopId: string, input: SubscriptionInput) {
  requirePlatformAdmin(admin);
  const { rowCount } = await deps.db.query(
    `UPDATE subscriptions SET status = $2, current_period_end = $3, grace_until = $4, updated_at = $5
     WHERE shop_id = $1`,
    [shopId, input.status, input.currentPeriodEnd ?? null, input.graceUntil ?? null, deps.clock.now()],
  );
  if (!rowCount) throw notFound('Shop');
}

export async function listShopsForAdmin(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query(
    `SELECT s.id, s.slug, s.name, s.reviewed_at, sub.status AS subscription_status, sub.grace_until,
       (SELECT count(*)::int FROM shop_members m WHERE m.shop_id = s.id AND m.active AND m.bookable) AS seats
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id ORDER BY s.created_at DESC`,
  );
  return rows;
}

export type ShopSettingsInput = Partial<{
  name: string;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: Shop['audience'];
  cancellationCutoffMinutes: number;
  minLeadMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  bookingHorizonDays: number;
  maxFutureBookings: number;
}>;

const SETTING_COLUMNS: Record<keyof ShopSettingsInput, string> = {
  name: 'name',
  phone: 'phone',
  address: 'address',
  latitude: 'latitude',
  longitude: 'longitude',
  audience: 'audience',
  cancellationCutoffMinutes: 'cancellation_cutoff_minutes',
  minLeadMinutes: 'min_lead_minutes',
  bufferMinutes: 'buffer_minutes',
  slotStepMinutes: 'slot_step_minutes',
  bookingHorizonDays: 'booking_horizon_days',
  maxFutureBookings: 'max_future_bookings',
};

export async function updateShopSettings(deps: Deps, user: User, shopId: string, input: ShopSettingsInput) {
  await requireOwner(deps.db, user, shopId);
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [keyof ShopSettingsInput, unknown][];
  if (entries.length) {
    const sets = entries.map(([k], i) => `${SETTING_COLUMNS[k]} = $${i + 2}`);
    const values = entries.map(([k, v]) => (k === 'phone' && typeof v === 'string' ? normalizePhone(v) : v));
    await deps.db.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = $1`, [shopId, ...values]);
  }
  return getShopById(deps.db, shopId);
}

export type WeeklyWindowInput = { weekday: number; startMinute: number; endMinute: number };

export async function setAutoConfirmHours(deps: Deps, user: User, shopId: string, windows: WeeklyWindowInput[]) {
  await requireOwner(deps.db, user, shopId);
  await withTx(deps.db, async (tx) => {
    await tx.query('DELETE FROM auto_confirm_hours WHERE shop_id = $1', [shopId]);
    for (const w of windows) {
      await tx.query(
        'INSERT INTO auto_confirm_hours (shop_id, weekday, start_minute, end_minute) VALUES ($1, $2, $3, $4)',
        [shopId, w.weekday, w.startMinute, w.endMinute],
      );
    }
  });
}
