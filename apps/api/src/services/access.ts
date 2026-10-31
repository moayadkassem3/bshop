import type { Queryable } from '../db.js';
import { forbidden } from '../errors.js';
import type { User } from './auth.js';

export type Membership = {
  id: string;
  shop_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  display_name: string;
  bookable: boolean;
};

/**
 * The caller's active membership in a shop, or 403. This is the shop-separation gate.
 * Customer-website sessions never reach shop data, and owner powers need a session
 * started through owner sign-in: through staff sign-in, everyone acts as staff.
 */
export async function requireMember(q: Queryable, user: User, shopId: string): Promise<Membership> {
  if (user.portal === 'customer') throw forbidden('Sign in through staff or owner sign-in');
  const { rows } = await q.query<Membership>(
    `SELECT id, shop_id, user_id, role, display_name, bookable FROM shop_members
     WHERE shop_id = $1 AND user_id = $2 AND active`,
    [shopId, user.id],
  );
  if (!rows[0]) throw forbidden('Not a member of this shop');
  return user.portal === 'owner' ? rows[0] : { ...rows[0], role: 'staff' };
}

export async function requireOwner(q: Queryable, user: User, shopId: string): Promise<Membership> {
  const member = await requireMember(q, user, shopId);
  if (member.role !== 'owner') throw forbidden('Owner permission required');
  return member;
}

/** Staff act on their own records; owners act on everyone's. */
export function requireSelfOrOwner(member: Membership, staffId: string) {
  if (member.role !== 'owner' && member.id !== staffId) throw forbidden('Staff can only manage their own records');
}

export function requirePlatformAdmin(user: User) {
  if (!user.is_platform_admin) throw forbidden('Platform admin only');
}
