import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { planForStaff } from '../domain/plans.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { normalizePhone } from '../phone.js';
import { requireMember, requireOwner, requireSelfOrOwner } from './access.js';
import { upsertUserByPhone, type User } from './auth.js';
import { PUBLIC_CONDITION, type WeeklyWindowInput } from './shops.js';

/** Shops the caller works at, with the role this session may act as. */
export async function listMyShops(deps: Deps, user: User) {
  if (user.portal === 'customer') throw forbidden('Sign in through staff or owner sign-in');
  const { rows } = await deps.db.query<{ id: string; name: string; slug: string; member_id: string; role: string; display_name: string; seats: number }>(
    `SELECT s.id, s.name, s.slug, m.id AS member_id, m.role, m.owner_label, m.display_name,
       s.reviewed_at, sub.status AS subscription_status, sub.current_period_end, sub.grace_until,
       -- Whether customers can see and book the salon now (v1.7): a lapsed trial or subscription hides it.
       (${PUBLIC_CONDITION.replaceAll('$1', '$2')}) AS visible,
       (SELECT max(r.created_at) FROM subscription_requests r WHERE r.shop_id = s.id) AS subscription_requested_at,
       -- For Keşfet in business mode (v1.7): the map starts at the salon and shows its card.
       s.latitude, s.longitude, s.district, s.city, s.audience,
       (SELECT p.id FROM shop_photos p WHERE p.shop_id = s.id ORDER BY p.position LIMIT 1) AS cover_photo_id,
       -- Billing seats, for "Paketler ve fiyatlar" (v1.7): the plan follows the bookable staff count.
       (SELECT count(*)::int FROM shop_members b WHERE b.shop_id = s.id AND b.active AND b.bookable) AS seats
     FROM shop_members m JOIN shops s ON s.id = m.shop_id JOIN subscriptions sub ON sub.shop_id = s.id
     WHERE m.user_id = $1 AND m.active ORDER BY s.name COLLATE "tr-x-icu"`,
    [user.id, deps.clock.now()],
  );
  return rows.map((r) => {
    const shop = { ...r, plan_id: planForStaff(r.seats)?.id ?? null };
    return user.portal === 'owner' ? shop : { ...shop, role: 'staff' };
  });
}

export async function listMembers(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  const { rows } = await deps.db.query(
    `SELECT m.id, m.role, m.owner_label, m.display_name, m.bookable, m.active, u.phone
     FROM shop_members m JOIN users u ON u.id = m.user_id
     WHERE m.shop_id = $1
     -- Members added together (registration) share created_at: owner, then co-owners, then staff.
     ORDER BY m.created_at, CASE m.owner_label WHEN 'owner' THEN 0 WHEN 'co_owner' THEN 1 ELSE 2 END,
       m.display_name COLLATE "tr-x-icu"`,
    [shopId],
  );
  return rows;
}

export async function addMember(
  deps: Deps,
  user: User,
  shopId: string,
  input: { phone: string; displayName: string; role: 'owner' | 'co_owner' | 'staff'; bookable: boolean },
) {
  await requireOwner(deps.db, user, shopId);
  // "Ortak" (co-owner) has the owner's permissions; only the label differs (v1.6).
  const role = input.role === 'staff' ? 'staff' : 'owner';
  const label = input.role === 'staff' ? null : input.role;
  return withTx(deps.db, async (tx) => {
    const userId = await upsertUserByPhone(tx, normalizePhone(input.phone));
    const existing = await tx.query<{ id: string; active: boolean }>(
      'SELECT id, active FROM shop_members WHERE shop_id = $1 AND user_id = $2',
      [shopId, userId],
    );
    let memberId: string;
    if (existing.rows[0]?.active) throw conflict('ALREADY_MEMBER', 'This phone number is already on the team');
    if (existing.rows[0]) {
      // Someone removed earlier comes back with their history (v1.7).
      memberId = existing.rows[0].id;
      await tx.query(
        'UPDATE shop_members SET active = true, role = $2, owner_label = $3, display_name = $4, bookable = $5 WHERE id = $1',
        [memberId, role, label, input.displayName, input.bookable],
      );
    } else {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO shop_members (shop_id, user_id, role, owner_label, display_name, bookable)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [shopId, userId, role, label, input.displayName, input.bookable],
      );
      memberId = rows[0]!.id;
    }
    if (input.bookable) await giveShopDefaults(tx, shopId, memberId);
    return { memberId };
  });
}

/**
 * A new person who takes appointments starts with the salon's hours (copied from
 * the longest-serving bookable member) and every active service, so customers can
 * book them at once; they adjust both later. Existing settings are kept.
 */
async function giveShopDefaults(tx: pg.PoolClient, shopId: string, memberId: string) {
  const hasHours = await tx.query('SELECT 1 FROM working_hours WHERE member_id = $1 LIMIT 1', [memberId]);
  if (!hasHours.rowCount) {
    await tx.query(
      `INSERT INTO working_hours (shop_id, member_id, weekday, start_minute, end_minute)
       SELECT $1, $2, h.weekday, h.start_minute, h.end_minute FROM working_hours h
       WHERE h.member_id = (
         SELECT m.id FROM shop_members m
         WHERE m.shop_id = $1 AND m.id <> $2 AND m.active AND m.bookable
           AND EXISTS (SELECT 1 FROM working_hours x WHERE x.member_id = m.id)
         ORDER BY m.created_at LIMIT 1)`,
      [shopId, memberId],
    );
  }
  await tx.query(
    `INSERT INTO member_services (shop_id, member_id, service_id)
     SELECT $1, $2, s.id FROM services s WHERE s.shop_id = $1 AND s.active
     ON CONFLICT DO NOTHING`,
    [shopId, memberId],
  );
}

/** A newly added service is offered by everyone who takes appointments; each can remove it later. */
async function offerToBookableMembers(q: Queryable, shopId: string, serviceIds: string[]) {
  await q.query(
    `INSERT INTO member_services (shop_id, member_id, service_id)
     SELECT $1, m.id, s FROM shop_members m CROSS JOIN unnest($2::uuid[]) AS s
     WHERE m.shop_id = $1 AND m.active AND m.bookable
     ON CONFLICT DO NOTHING`,
    [shopId, serviceIds],
  );
}

/**
 * Deactivating a member ends their access immediately (handoff 2.1, staff removal):
 * requireMember only accepts active members.
 */
export async function updateMember(
  deps: Deps,
  user: User,
  shopId: string,
  memberId: string,
  input: Partial<{ displayName: string; role: 'owner' | 'co_owner' | 'staff'; bookable: boolean; active: boolean }>,
) {
  const me = await requireOwner(deps.db, user, shopId);
  if (memberId === me.id && (input.active === false || input.role === 'staff')) {
    throw badRequest('CANNOT_DEMOTE_SELF', 'Owners cannot remove or demote themselves');
  }
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ owner_label: string | null; bookable: boolean; active: boolean }>(
      'SELECT owner_label, bookable, active FROM shop_members WHERE shop_id = $1 AND id = $2 FOR UPDATE',
      [shopId, memberId],
    );
    const member = rows[0];
    if (!member) throw notFound('Member');
    // The salon's founding owner keeps their place; co-owners cannot remove or demote them (v1.7).
    if (member.owner_label === 'owner' && memberId !== me.id && (input.active === false || (input.role && input.role !== 'owner'))) {
      throw forbidden('The salon owner cannot be removed or demoted');
    }
    if (input.active === false || input.bookable === false) {
      const upcoming = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM appointments
         WHERE staff_id = $1 AND status IN ('pending', 'offered', 'confirmed') AND starts_at > $2`,
        [memberId, deps.clock.now()],
      );
      if (upcoming.rows[0]!.n > 0) {
        throw new AppError(409, 'MEMBER_HAS_APPOINTMENTS', `${upcoming.rows[0]!.n} upcoming appointments; cancel or move them first`);
      }
    }
    // "Ortak" is an owner with the co-owner label; the founding owner keeps the "owner" label.
    const role = input.role === undefined ? null : input.role === 'staff' ? 'staff' : 'owner';
    const label =
      input.role === undefined ? undefined : input.role === 'staff' ? null : member.owner_label === 'owner' ? 'owner' : 'co_owner';
    await tx.query(
      `UPDATE shop_members SET
         display_name = COALESCE($3, display_name), role = COALESCE($4, role),
         owner_label = CASE WHEN $7 THEN $8 ELSE owner_label END,
         bookable = COALESCE($5, bookable), active = COALESCE($6, active)
       WHERE shop_id = $1 AND id = $2`,
      [shopId, memberId, input.displayName ?? null, role, input.bookable ?? null, input.active ?? null, label !== undefined, label ?? null],
    );
    if (input.bookable === true && !member.bookable) await giveShopDefaults(tx, shopId, memberId);
  });
}

export async function setWorkingHours(
  deps: Deps,
  user: User,
  shopId: string,
  memberId: string,
  windows: WeeklyWindowInput[],
) {
  const me = await requireMember(deps.db, user, shopId);
  requireSelfOrOwner(me, memberId);
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const sorted = windows.filter((w) => w.weekday === day).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startMinute < sorted[i - 1]!.endMinute) throw badRequest('HOURS_OVERLAP');
    }
  }
  await withTx(deps.db, async (tx) => {
    await tx.query('DELETE FROM working_hours WHERE shop_id = $1 AND member_id = $2', [shopId, memberId]);
    for (const w of windows) {
      await tx.query(
        `INSERT INTO working_hours (shop_id, member_id, weekday, start_minute, end_minute)
         VALUES ($1, $2, $3, $4, $5)`,
        [shopId, memberId, w.weekday, w.startMinute, w.endMinute],
      );
    }
  });
}

export async function listCatalog(deps: Deps) {
  const { rows } = await deps.db.query('SELECT id, name, duration_minutes FROM catalog_services ORDER BY id');
  return rows;
}

/** Copies picked template services into the shop's list, each with the owner's price. */
export async function importCatalog(
  deps: Deps,
  user: User,
  shopId: string,
  items: { catalogId: number; priceKurus: number; priceIsStartingFrom?: boolean }[],
) {
  await requireOwner(deps.db, user, shopId);
  return withTx(deps.db, async (tx) => {
    const ids: string[] = [];
    for (const item of items) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO services (shop_id, catalog_service_id, name, duration_minutes, price_kurus, price_is_starting_from, sort_order)
         SELECT $1, c.id, c.name, c.duration_minutes, $3, $4, c.id FROM catalog_services c WHERE c.id = $2
         RETURNING id`,
        [shopId, item.catalogId, item.priceKurus, item.priceIsStartingFrom ?? false],
      );
      if (!rows[0]) throw notFound(`Catalog service ${item.catalogId}`);
      ids.push(rows[0].id);
    }
    await offerToBookableMembers(tx, shopId, ids);
    return ids;
  });
}

export type ServiceInput = {
  name: string;
  durationMinutes: number;
  priceKurus: number;
  priceIsStartingFrom?: boolean;
};

export async function createService(deps: Deps, user: User, shopId: string, input: ServiceInput) {
  await requireOwner(deps.db, user, shopId);
  return withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO services (shop_id, name, duration_minutes, price_kurus, price_is_starting_from, sort_order)
       VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id`,
      [shopId, input.name, input.durationMinutes, input.priceKurus, input.priceIsStartingFrom ?? false],
    );
    await offerToBookableMembers(tx, shopId, [rows[0]!.id]);
    return rows[0]!.id;
  });
}

/** Rename, re-price, change the default duration, or hide a service. Past appointments keep their snapshot. */
export async function updateService(
  deps: Deps,
  user: User,
  shopId: string,
  serviceId: string,
  input: Partial<ServiceInput & { active: boolean; sortOrder: number }>,
) {
  await requireOwner(deps.db, user, shopId);
  const { rowCount } = await deps.db.query(
    `UPDATE services SET
       name = COALESCE($3, name), duration_minutes = COALESCE($4, duration_minutes),
       price_kurus = COALESCE($5, price_kurus), price_is_starting_from = COALESCE($6, price_is_starting_from),
       active = COALESCE($7, active), sort_order = COALESCE($8, sort_order)
     WHERE shop_id = $1 AND id = $2`,
    [
      shopId,
      serviceId,
      input.name ?? null,
      input.durationMinutes ?? null,
      input.priceKurus ?? null,
      input.priceIsStartingFrom ?? null,
      input.active ?? null,
      input.sortOrder ?? null,
    ],
  );
  if (!rowCount) throw notFound('Service');
}

export async function listServices(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  const { rows } = await deps.db.query(
    `SELECT id, catalog_service_id, name, duration_minutes, price_kurus, price_is_starting_from, active
     FROM services WHERE shop_id = $1 ORDER BY sort_order, name COLLATE "tr-x-icu"`,
    [shopId],
  );
  return rows;
}

/** Staff pick which shop services they perform and their own durations (handoff 2, v1.1). */
export async function setMemberServices(
  deps: Deps,
  user: User,
  shopId: string,
  memberId: string,
  items: { serviceId: string; durationMinutes?: number | null }[],
) {
  const me = await requireMember(deps.db, user, shopId);
  requireSelfOrOwner(me, memberId);
  await withTx(deps.db, async (tx) => {
    await tx.query('DELETE FROM member_services WHERE shop_id = $1 AND member_id = $2', [shopId, memberId]);
    for (const item of items) {
      // The composite foreign keys reject services or members from another shop.
      await tx.query(
        'INSERT INTO member_services (shop_id, member_id, service_id, duration_minutes) VALUES ($1, $2, $3, $4)',
        [shopId, memberId, item.serviceId, item.durationMinutes ?? null],
      );
    }
  });
}

export async function setCustomerBlocked(deps: Deps, user: User, shopId: string, customerId: string, blocked: boolean) {
  await requireOwner(deps.db, user, shopId);
  await deps.db.query(
    `INSERT INTO shop_customers (shop_id, user_id, blocked) VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, user_id) DO UPDATE SET blocked = EXCLUDED.blocked`,
    [shopId, customerId, blocked],
  );
}
