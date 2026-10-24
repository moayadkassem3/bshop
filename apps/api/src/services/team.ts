import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { normalizePhone } from '../phone.js';
import { requireMember, requireOwner, requireSelfOrOwner } from './access.js';
import { upsertUserByPhone, type User } from './auth.js';
import type { WeeklyWindowInput } from './shops.js';

/** Shops the caller works at, with the role this session may act as. */
export async function listMyShops(deps: Deps, user: User) {
  if (user.portal === 'customer') throw forbidden('Sign in through staff or owner sign-in');
  const { rows } = await deps.db.query<{ id: string; name: string; slug: string; member_id: string; role: string; display_name: string }>(
    `SELECT s.id, s.name, s.slug, m.id AS member_id, m.role, m.display_name
     FROM shop_members m JOIN shops s ON s.id = m.shop_id WHERE m.user_id = $1 AND m.active ORDER BY s.name`,
    [user.id],
  );
  return rows.map((r) => (user.portal === 'owner' ? r : { ...r, role: 'staff' }));
}

export async function listMembers(deps: Deps, user: User, shopId: string) {
  await requireMember(deps.db, user, shopId);
  const { rows } = await deps.db.query(
    `SELECT m.id, m.role, m.display_name, m.bookable, m.active, u.phone
     FROM shop_members m JOIN users u ON u.id = m.user_id
     WHERE m.shop_id = $1 ORDER BY m.created_at`,
    [shopId],
  );
  return rows;
}

export async function addMember(
  deps: Deps,
  user: User,
  shopId: string,
  input: { phone: string; displayName: string; role: 'owner' | 'staff'; bookable: boolean },
) {
  await requireOwner(deps.db, user, shopId);
  return withTx(deps.db, async (tx) => {
    const userId = await upsertUserByPhone(tx, normalizePhone(input.phone));
    const existing = await tx.query('SELECT 1 FROM shop_members WHERE shop_id = $1 AND user_id = $2', [shopId, userId]);
    if (existing.rowCount) throw conflict('ALREADY_MEMBER', 'This phone number is already on the team');
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO shop_members (shop_id, user_id, role, display_name, bookable)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [shopId, userId, input.role, input.displayName, input.bookable],
    );
    return { memberId: rows[0]!.id };
  });
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
  input: Partial<{ displayName: string; role: 'owner' | 'staff'; bookable: boolean; active: boolean }>,
) {
  const me = await requireOwner(deps.db, user, shopId);
  if (memberId === me.id && (input.active === false || input.role === 'staff')) {
    throw badRequest('CANNOT_DEMOTE_SELF', 'Owners cannot remove or demote themselves');
  }
  const { rowCount } = await deps.db.query(
    `UPDATE shop_members SET
       display_name = COALESCE($3, display_name), role = COALESCE($4, role),
       bookable = COALESCE($5, bookable), active = COALESCE($6, active)
     WHERE shop_id = $1 AND id = $2`,
    [shopId, memberId, input.displayName ?? null, input.role ?? null, input.bookable ?? null, input.active ?? null],
  );
  if (!rowCount) throw notFound('Member');
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
  const { rows } = await deps.db.query<{ id: string }>(
    `INSERT INTO services (shop_id, name, duration_minutes, price_kurus, price_is_starting_from, sort_order)
     VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id`,
    [shopId, input.name, input.durationMinutes, input.priceKurus, input.priceIsStartingFrom ?? false],
  );
  return rows[0]!.id;
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
     FROM services WHERE shop_id = $1 ORDER BY sort_order, name`,
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
