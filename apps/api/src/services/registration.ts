import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { badRequest, conflict } from '../errors.js';
import { RESERVED_SLUGS, slugify } from '../domain/slug.js';
import { normalizePhone, normalizeShopPhone } from '../phone.js';
import { createSession, upsertUserByPhone, type User } from './auth.js';
import { assertIncludesRequired, recordConsents, type ConsentInput } from './consents.js';
import { normalizeInstagram, type Shop } from './shops.js';
import type { WeeklyWindowInput } from './shops.js';

export type RegistrationService =
  | { catalogId: number; priceKurus: number; priceIsStartingFrom?: boolean }
  | { name: string; durationMinutes: number; priceKurus: number; priceIsStartingFrom?: boolean };

export type RegistrationInput = {
  audience: Shop['audience'];
  name: string;
  phone: string;
  whatsapp?: string | null;
  instagram?: string | null;
  about?: string | null;
  city: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: WeeklyWindowInput[];
  services: RegistrationService[];
  owner: { displayName: string; bookable: boolean };
  members: { displayName: string; phone: string; role: 'staff' | 'co_owner'; bookable: boolean }[];
  consents: ConsentInput[];
};

/** A free link for the shop, based on its name: "nirvana-for-men", then "nirvana-for-men-2", ... */
async function freeSlug(tx: pg.PoolClient, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const taken = await tx.query('SELECT 1 FROM shops WHERE slug = $1', [candidate]);
    if (!taken.rowCount) return candidate;
  }
  throw conflict('SLUG_TAKEN', 'Choose a different shop name');
}

/**
 * Self-service registration (handoff v1.6): the signed-in person becomes the
 * owner. The shop stays hidden until our team reviews it; approval starts the
 * 7-day trial. Returns an owner session so photos can be added straight away.
 */
export async function registerShop(deps: Deps, user: User, input: RegistrationInput) {
  assertIncludesRequired(input.consents, 'business');
  const staffCount = (input.owner.bookable ? 1 : 0) + input.members.filter((m) => m.bookable).length;
  if (staffCount === 0) throw badRequest('NO_STAFF', 'At least one person must take appointments');
  if (input.services.length === 0) throw badRequest('NO_SERVICES', 'Add at least one service');
  if (!input.hours.length) throw badRequest('NO_HOURS', 'Add your working hours');

  const phones = input.members.map((m) => normalizePhone(m.phone));
  if (new Set([user.phone, ...phones]).size !== phones.length + 1) {
    throw badRequest('DUPLICATE_MEMBER', 'Each person needs a different phone number');
  }
  const now = deps.clock.now();

  return withTx(deps.db, async (tx) => {
    // One registration under review at a time, per person.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${user.id}`]);
    const pending = await tx.query('SELECT 1 FROM shops WHERE registered_by = $1 AND reviewed_at IS NULL LIMIT 1', [user.id]);
    if (pending.rowCount) throw conflict('REGISTRATION_PENDING', 'Your previous registration is still under review');

    const slug = await freeSlug(tx, input.name);
    const shop = (
      await tx.query<{ id: string }>(
        `INSERT INTO shops (name, slug, phone, whatsapp, instagram, about, address, district, city, latitude, longitude,
           audience, registered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          input.name.trim(),
          slug,
          normalizeShopPhone(input.phone),
          input.whatsapp ? normalizePhone(input.whatsapp) : null,
          input.instagram ? normalizeInstagram(input.instagram) : null,
          input.about?.trim() || null,
          input.address.trim(),
          input.district.trim(),
          input.city.trim(),
          input.latitude,
          input.longitude,
          input.audience,
          user.id,
        ],
      )
    ).rows[0]!;
    await tx.query('INSERT INTO subscriptions (shop_id) VALUES ($1)', [shop.id]);

    const memberIds: { id: string; bookable: boolean }[] = [];
    const owner = await tx.query<{ id: string }>(
      `INSERT INTO shop_members (shop_id, user_id, role, owner_label, display_name, bookable)
       VALUES ($1, $2, 'owner', 'owner', $3, $4) RETURNING id`,
      [shop.id, user.id, input.owner.displayName.trim(), input.owner.bookable],
    );
    memberIds.push({ id: owner.rows[0]!.id, bookable: input.owner.bookable });
    for (const [i, m] of input.members.entries()) {
      const userId = await upsertUserByPhone(tx, phones[i]!);
      const row = await tx.query<{ id: string }>(
        `INSERT INTO shop_members (shop_id, user_id, role, owner_label, display_name, bookable)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          shop.id,
          userId,
          m.role === 'co_owner' ? 'owner' : 'staff',
          m.role === 'co_owner' ? 'co_owner' : null,
          m.displayName.trim(),
          m.role === 'staff' ? true : m.bookable,
        ],
      );
      memberIds.push({ id: row.rows[0]!.id, bookable: m.role === 'staff' || m.bookable });
    }

    const serviceIds: string[] = [];
    for (const [i, s] of input.services.entries()) {
      const row =
        'catalogId' in s
          ? await tx.query<{ id: string }>(
              `INSERT INTO services (shop_id, catalog_service_id, name, duration_minutes, price_kurus, price_is_starting_from, sort_order)
               SELECT $1, c.id, c.name, c.duration_minutes, $3, $4, $5 FROM catalog_services c WHERE c.id = $2 RETURNING id`,
              [shop.id, s.catalogId, s.priceKurus, s.priceIsStartingFrom ?? false, i],
            )
          : await tx.query<{ id: string }>(
              `INSERT INTO services (shop_id, name, duration_minutes, price_kurus, price_is_starting_from, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [shop.id, s.name.trim(), s.durationMinutes, s.priceKurus, s.priceIsStartingFrom ?? false, i],
            );
      if (!row.rows[0]) throw badRequest('UNKNOWN_SERVICE', 'A selected service does not exist');
      serviceIds.push(row.rows[0].id);
    }

    // Everyone who takes appointments starts with the shop's hours and every service; they can adjust later.
    for (const m of memberIds.filter((x) => x.bookable)) {
      for (const w of input.hours) {
        await tx.query(
          'INSERT INTO working_hours (shop_id, member_id, weekday, start_minute, end_minute) VALUES ($1, $2, $3, $4, $5)',
          [shop.id, m.id, w.weekday, w.startMinute, w.endMinute],
        );
      }
      for (const serviceId of serviceIds) {
        await tx.query('INSERT INTO member_services (shop_id, member_id, service_id) VALUES ($1, $2, $3)', [shop.id, m.id, serviceId]);
      }
    }

    await recordConsents(tx, user.id, input.consents, now, shop.id);
    const token = await createSession(tx, deps, user.id, 'owner', now);
    return { shopId: shop.id, slug, staffCount, token };
  });
}
