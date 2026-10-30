import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { PLAN_TERMS, planForStaff } from '../domain/plans.js';
import { sms } from '../messages.js';
import { queueSms } from '../notifications.js';
import { normalizePhone, normalizeShopPhone } from '../phone.js';
import { requireOwner, requirePlatformAdmin } from './access.js';
import { upsertUserByPhone, type User } from './auth.js';

export type Shop = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  whatsapp: string | null;
  instagram: string | null;
  about: string | null;
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

const SHOP_COLUMNS = `s.id, s.slug, s.name, s.phone, s.address, s.district, s.city, s.whatsapp, s.instagram, s.about,
  s.latitude, s.longitude, s.timezone, s.audience,
  s.cancellation_cutoff_minutes, s.min_lead_minutes, s.buffer_minutes, s.slot_step_minutes,
  s.booking_horizon_days, s.max_future_bookings, s.reviewed_at`;

/** Public = reviewed by our team and paid up (trial, active, or past due within the grace period). */
export const PUBLIC_CONDITION = `s.reviewed_at IS NOT NULL AND (
  sub.status = 'active'
  OR (sub.status = 'trial' AND sub.current_period_end > $1)
  OR (sub.status = 'past_due' AND sub.grace_until > $1))`;

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

/** Home-page search by shop name or address. */
export async function searchPublicShops(deps: Deps, query: string) {
  const { rows } = await deps.db.query(
    `SELECT s.slug, s.name, s.address, s.district, s.city, s.audience,
       (SELECT p.id FROM shop_photos p WHERE p.shop_id = s.id ORDER BY p.position LIMIT 1) AS cover_photo_id
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE ${PUBLIC_CONDITION} AND (s.name ILIKE $2 OR s.address ILIKE $2 OR s.district ILIKE $2 OR s.city ILIKE $2)
     ORDER BY s.name COLLATE "tr-x-icu" LIMIT 20`,
    [deps.clock.now(), `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`],
  );
  return rows;
}

export type NearbyQuery = {
  latitude: number;
  longitude: number;
  query?: string;
  audience?: 'men' | 'women';
  radiusKm: number;
  limit: number;
};

/**
 * Keşfet map: public shops around a point, nearest first. Matches the shop's
 * name, district, city, or one of its services. Unisex shops count for both audiences.
 */
export async function nearbyShops(deps: Deps, q: NearbyQuery) {
  const distance = `(2 * 6371000 * asin(sqrt(
    power(sin(radians($2 - s.latitude) / 2), 2) +
    cos(radians($2)) * cos(radians(s.latitude)) * power(sin(radians($3 - s.longitude) / 2), 2))))`;
  const text = q.query?.trim() ? `%${q.query.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const { rows } = await deps.db.query(
    `SELECT * FROM (
       SELECT s.slug, s.name, s.district, s.city, s.audience, s.latitude, s.longitude,
         (SELECT p.id FROM shop_photos p WHERE p.shop_id = s.id ORDER BY p.position LIMIT 1) AS cover_photo_id,
         round(${distance})::int AS distance_m
       FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id
       WHERE ${PUBLIC_CONDITION} AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
         AND ($4::text IS NULL OR s.name ILIKE $4 OR s.district ILIKE $4 OR s.city ILIKE $4
              OR EXISTS (SELECT 1 FROM services sv WHERE sv.shop_id = s.id AND sv.active AND sv.name ILIKE $4))
         AND ($5::text IS NULL OR s.audience IN ($5, 'unisex'))
     ) found
     WHERE distance_m <= $6
     ORDER BY distance_m, name COLLATE "tr-x-icu"
     LIMIT $7`,
    [deps.clock.now(), q.latitude, q.longitude, text, q.audience ?? null, q.radiusKm * 1000, q.limit],
  );
  return rows;
}

export type CreateShopInput = {
  name: string;
  slug: string;
  phone?: string;
  address?: string;
  district?: string;
  city?: string;
  whatsapp?: string;
  instagram?: string;
  latitude?: number;
  longitude?: number;
  audience?: Shop['audience'];
  owner: { phone: string; firstName: string; lastName: string; displayName: string; bookable: boolean };
};

/** Accepts "@handle", "handle", or an instagram.com link; stores the bare handle. */
export function normalizeInstagram(input: string): string {
  const handle = input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw badRequest('INVALID_INSTAGRAM', 'Instagram handle is not valid');
  return handle;
}

/** Our team creates the shop and its owner during the face-to-face visit. */
export async function createShop(deps: Deps, admin: User, input: CreateShopInput) {
  requirePlatformAdmin(admin);
  return withTx(deps.db, async (tx) => {
    const exists = await tx.query('SELECT 1 FROM shops WHERE slug = $1', [input.slug]);
    if (exists.rowCount) throw conflict('SLUG_TAKEN', 'This shop link is already used');
    const shop = (
      await tx.query<{ id: string }>(
        `INSERT INTO shops (name, slug, phone, address, district, city, whatsapp, instagram, latitude, longitude, audience)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          input.name,
          input.slug,
          input.phone ? normalizeShopPhone(input.phone) : null,
          input.address ?? null,
          input.district ?? null,
          input.city ?? null,
          input.whatsapp ? normalizePhone(input.whatsapp) : null,
          input.instagram ? normalizeInstagram(input.instagram) : null,
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
        `INSERT INTO shop_members (shop_id, user_id, role, owner_label, display_name, bookable)
         VALUES ($1, $2, 'owner', 'owner', $3, $4) RETURNING id`,
        [shop.id, ownerId, input.owner.displayName, input.owner.bookable],
      )
    ).rows[0]!;
    return { shopId: shop.id, ownerMemberId: member.id };
  });
}

/** Approval by our team. A shop without a subscription yet starts its free trial now (v1.6). */
export async function markReviewed(deps: Deps, admin: User, shopId: string) {
  requirePlatformAdmin(admin);
  await approveShop(deps, shopId, admin.id);
}

/** Approves a shop; reviewerId is null when a test deployment approves it automatically (DEMO_MODE). */
export async function approveShop(deps: Deps, shopId: string, reviewerId: string | null) {
  const now = deps.clock.now();
  await withTx(deps.db, async (tx) => {
    const { rowCount } = await tx.query('UPDATE shops SET reviewed_at = $2, reviewed_by = $3 WHERE id = $1', [shopId, now, reviewerId]);
    if (!rowCount) throw notFound('Shop');
    const trial = await tx.query(
      `UPDATE subscriptions SET status = 'trial', current_period_end = $2, updated_at = $3
       WHERE shop_id = $1 AND status = 'none'`,
      [shopId, new Date(now.getTime() + PLAN_TERMS.trialDays * 86_400_000), now],
    );
    // A self-registered shop hears about its approval by SMS (v1.6).
    if (trial.rowCount) {
      const { rows } = await tx.query<{ name: string; slug: string; phone: string }>(
        'SELECT s.name, s.slug, u.phone FROM shops s JOIN users u ON u.id = s.registered_by WHERE s.id = $1',
        [shopId],
      );
      const shop = rows[0];
      if (shop) {
        await queueSms(tx, now, {
          shopId,
          phone: shop.phone,
          template: 'shop_approved',
          body: sms.shopApproved({ shop: shop.name, trialDays: PLAN_TERMS.trialDays, link: `${deps.config.publicWebUrl}/${shop.slug}` }),
        });
      }
    }
  });
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
  const { rows } = await deps.db.query<{ seats: number }>(
    `SELECT s.id, s.slug, s.name, s.reviewed_at, s.registered_by, sub.status AS subscription_status,
       sub.current_period_end, sub.grace_until,
       (SELECT count(*)::int FROM shop_members m WHERE m.shop_id = s.id AND m.active AND m.bookable) AS seats
     FROM shops s JOIN subscriptions sub ON sub.shop_id = s.id ORDER BY s.created_at DESC`,
  );
  return rows.map((r) => ({ ...r, plan: planForStaff(r.seats) }));
}

export type ShopSettingsInput = Partial<{
  name: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  whatsapp: string | null;
  instagram: string | null;
  about: string | null;
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
  district: 'district',
  city: 'city',
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  about: 'about',
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

/** The shop's details for its owners' edit screen (v1.7), including while it is under review. */
export async function getShopSettings(deps: Deps, user: User, shopId: string) {
  await requireOwner(deps.db, user, shopId);
  return getShopById(deps.db, shopId);
}

export async function updateShopSettings(deps: Deps, user: User, shopId: string, input: ShopSettingsInput) {
  await requireOwner(deps.db, user, shopId);
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [keyof ShopSettingsInput, unknown][];
  if (entries.length) {
    const sets = entries.map(([k], i) => `${SETTING_COLUMNS[k]} = $${i + 2}`);
    const values = entries.map(([k, v]) =>
      typeof v !== 'string' ? v : k === 'phone' ? normalizeShopPhone(v) : k === 'whatsapp' ? normalizePhone(v) : k === 'instagram' ? normalizeInstagram(v) : v,
    );
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

/**
 * "Aboneliği başlat" (v1.7): until online payment exists, an owner asks our team
 * to start the subscription. Once a day at most; our team is told by SMS and
 * activates it from the back office.
 */
export async function requestSubscription(deps: Deps, user: User, shopId: string) {
  await requireOwner(deps.db, user, shopId);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    await tx.query('SELECT id FROM shops WHERE id = $1 FOR UPDATE', [shopId]);
    const recent = await tx.query<{ created_at: Date }>(
      'SELECT created_at FROM subscription_requests WHERE shop_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1',
      [shopId, new Date(now.getTime() - 86_400_000)],
    );
    if (recent.rows[0]) return { requestedAt: recent.rows[0].created_at };
    const { rows } = await tx.query<{ name: string; seats: number }>(
      `SELECT s.name, (SELECT count(*)::int FROM shop_members m WHERE m.shop_id = s.id AND m.active AND m.bookable) AS seats
       FROM shops s WHERE s.id = $1`,
      [shopId],
    );
    const plan = planForStaff(rows[0]!.seats);
    await tx.query('INSERT INTO subscription_requests (shop_id, user_id, plan_id, created_at) VALUES ($1, $2, $3, $4)', [
      shopId,
      user.id,
      plan?.id ?? null,
      now,
    ]);
    const admins = await tx.query<{ id: string; phone: string }>('SELECT id, phone FROM users WHERE is_platform_admin');
    for (const admin of admins.rows) {
      await queueSms(tx, now, {
        shopId,
        userId: admin.id,
        phone: admin.phone,
        template: 'subscriptionRequest',
        body: sms.subscriptionRequest({ salon: rows[0]!.name, plan: plan?.name ?? `${rows[0]!.seats} personel (özel fiyat)`, phone: user.phone }),
      });
    }
    return { requestedAt: now };
  });
}
