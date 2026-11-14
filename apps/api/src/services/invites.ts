import type pg from 'pg';
import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { AppError, conflict, notFound } from '../errors.js';
import { queuePush, queueSms } from '../notifications.js';
import { normalizePhone } from '../phone.js';
import { requireOwner } from './access.js';
import { upsertUserByPhone, type User } from './auth.js';
import { joinShop, type JoinInput } from './team.js';

/**
 * Staff invites (founder, 9 November 2026). Adding someone to a salon's team sends an
 * invite instead of adding them at once: a push if they already use the app or website
 * (and an SMS too when no phone of theirs has the app), an SMS if they have never signed
 * up. They join when they accept it (Profil → Ekip daveti), or decline it.
 *
 * One person works at one salon: someone already on any salon's team cannot be invited as
 * staff, and someone working as staff cannot be invited anywhere else. Owners can still own
 * several salons (and be Ortak of one). Checked when inviting and again when accepting.
 */

/** One invite SMS per person per salon every 10 minutes ("Tekrar gönder"). */
const RESEND_MINUTES = 10;

export type InviteInput = JoinInput & { phone: string };

type Invite = {
  id: string;
  shop_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  owner_label: 'co_owner' | null;
  display_name: string;
  bookable: boolean;
  sent_via: string;
  created_at: Date;
  sent_at: Date;
};

const roleOf = (i: { role: string }): 'staff' | 'co_owner' => (i.role === 'staff' ? 'staff' : 'co_owner');

/** Someone on another salon's team who cannot join this one: as staff anywhere, or invited as staff. */
async function checkOneSalon(q: Queryable, userId: string, shopId: string, asStaff: boolean) {
  const { rows } = await q.query<{ role: string }>('SELECT role FROM shop_members WHERE user_id = $1 AND active AND shop_id <> $2', [userId, shopId]);
  if (rows.some((r) => r.role === 'staff') || (asStaff && rows.length)) {
    throw new AppError(409, 'STAFF_ELSEWHERE', 'This phone number is already registered with another salon');
  }
}

/** Has this person signed up (website or app) before? Then they get a push rather than only an SMS. */
async function signedUp(q: Queryable, userId: string) {
  const { rows } = await q.query<{ registered: boolean; phones: number }>(
    `SELECT (u.first_name IS NOT NULL OR EXISTS (SELECT 1 FROM consents c WHERE c.user_id = u.id)
             OR EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
             OR EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)) AS registered,
            (SELECT count(*)::int FROM push_devices d WHERE d.user_id = u.id) AS phones
     FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  return { registered: Boolean(rows[0]?.registered), phones: rows[0]?.phones ?? 0 };
}

async function send(deps: Deps, q: Queryable, invite: Pick<Invite, 'id' | 'shop_id' | 'user_id' | 'role'>, now: Date): Promise<string> {
  const shop = (await q.query<{ name: string }>('SELECT name FROM shops WHERE id = $1', [invite.shop_id])).rows[0]!.name;
  const phone = (await q.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [invite.user_id])).rows[0]!.phone;
  const as = invite.role === 'staff' ? 'personel' : 'ortak';
  const { registered, phones } = await signedUp(q, invite.user_id);
  const via: string[] = [];
  if (registered && phones) {
    await queuePush(q, now, {
      shopId: invite.shop_id,
      userIds: [invite.user_id],
      template: 'staff_invite',
      title: 'Ekip daveti',
      body: `${shop} sizi ekibine ${as} olarak davet etti. Kabul etmek için dokunun.`,
      data: { kind: 'invite', inviteId: invite.id },
    });
    via.push('push');
  }
  if (!registered || !phones) {
    const link = `${deps.config.publicWebUrl}/profil`;
    await queueSms(q, now, {
      shopId: invite.shop_id,
      phone,
      userId: invite.user_id,
      template: 'staff_invite',
      body: `${shop} sizi ekibine ${as} olarak davet etti. Kabul etmek için bu numarayla giriş yapın: ${link}`,
    });
    via.push('sms');
  }
  return via.join('+');
}

/** "+ Personel veya ortak ekle": sends the invite. */
export async function inviteMember(deps: Deps, user: User, shopId: string, input: InviteInput) {
  await requireOwner(deps.db, user, shopId);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const userId = await upsertUserByPhone(tx, normalizePhone(input.phone));
    const member = await tx.query('SELECT 1 FROM shop_members WHERE shop_id = $1 AND user_id = $2 AND active', [shopId, userId]);
    if (member.rowCount) throw conflict('ALREADY_MEMBER', 'This phone number is already on the team');
    const pending = await tx.query('SELECT 1 FROM staff_invites WHERE shop_id = $1 AND user_id = $2 AND status = $3', [shopId, userId, 'pending']);
    if (pending.rowCount) throw conflict('ALREADY_INVITED', 'This phone number already has an invite');
    await checkOneSalon(tx, userId, shopId, input.role === 'staff');
    const { rows } = await tx.query<Invite>(
      `INSERT INTO staff_invites (shop_id, user_id, role, owner_label, display_name, bookable, invited_by, sent_via, created_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8, $8) RETURNING *`,
      [shopId, userId, input.role === 'staff' ? 'staff' : 'owner', input.role === 'staff' ? null : 'co_owner', input.displayName.trim(), input.role === 'staff' ? true : input.bookable, user.id, now],
    );
    const via = await send(deps, tx, rows[0]!, now);
    await tx.query('UPDATE staff_invites SET sent_via = $2 WHERE id = $1', [rows[0]!.id, via]);
    return { inviteId: rows[0]!.id, sentVia: via };
  });
}

/** Invites sent at registration (salon kaydı): the same checks, without the owner check. */
export async function inviteAtRegistration(deps: Deps, tx: pg.PoolClient, shopId: string, invitedBy: string, input: InviteInput & { userId: string }) {
  const now = deps.clock.now();
  await checkOneSalon(tx, input.userId, shopId, input.role === 'staff');
  const { rows } = await tx.query<Invite>(
    `INSERT INTO staff_invites (shop_id, user_id, role, owner_label, display_name, bookable, invited_by, sent_via, created_at, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8, $8) RETURNING *`,
    [shopId, input.userId, input.role === 'staff' ? 'staff' : 'owner', input.role === 'staff' ? null : 'co_owner', input.displayName.trim(), input.role === 'staff' ? true : input.bookable, invitedBy, now],
  );
  const via = await send(deps, tx, rows[0]!, now);
  await tx.query('UPDATE staff_invites SET sent_via = $2 WHERE id = $1', [rows[0]!.id, via]);
}

/** Personel tab: invites not answered yet. */
export async function listInvites(deps: Deps, user: User, shopId: string) {
  await requireOwner(deps.db, user, shopId);
  const { rows } = await deps.db.query(
    `SELECT i.id, i.display_name, i.role, i.owner_label, i.sent_via, i.created_at, i.sent_at, u.phone
     FROM staff_invites i JOIN users u ON u.id = i.user_id
     WHERE i.shop_id = $1 AND i.status = 'pending' ORDER BY i.created_at, i.display_name COLLATE "tr-x-icu"`,
    [shopId],
  );
  return rows;
}

async function ownInvite(q: Queryable, shopId: string, id: string) {
  const { rows } = await q.query<Invite>(`SELECT * FROM staff_invites WHERE id = $1 AND shop_id = $2 AND status = 'pending'`, [id, shopId]);
  if (!rows[0]) throw notFound('Invite');
  return rows[0];
}

export async function cancelInvite(deps: Deps, user: User, shopId: string, id: string) {
  await requireOwner(deps.db, user, shopId);
  await ownInvite(deps.db, shopId, id);
  await deps.db.query(`UPDATE staff_invites SET status = 'cancelled', answered_at = $2 WHERE id = $1`, [id, deps.clock.now()]);
}

export async function resendInvite(deps: Deps, user: User, shopId: string, id: string) {
  await requireOwner(deps.db, user, shopId);
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const invite = await ownInvite(tx, shopId, id);
    if (now.getTime() - invite.sent_at.getTime() < RESEND_MINUTES * 60_000) {
      throw new AppError(429, 'RESEND_TOO_SOON', 'Wait a few minutes before sending it again');
    }
    const via = await send(deps, tx, invite, now);
    await tx.query('UPDATE staff_invites SET sent_via = $2, sent_at = $3 WHERE id = $1', [id, via, now]);
    return { sentVia: via };
  });
}

/** Profil → Ekip daveti: the invites waiting for this person. */
export async function myInvites(deps: Deps, user: User) {
  const { rows } = await deps.db.query(
    `SELECT i.id, i.role, i.owner_label, i.display_name, i.created_at, s.id AS shop_id, s.name AS shop_name, s.slug,
       COALESCE(s.logo_id, (SELECT p.id FROM shop_photos p WHERE p.shop_id = s.id ORDER BY p.position LIMIT 1)) AS cover_photo_id,
       (SELECT m.display_name FROM shop_members m WHERE m.shop_id = s.id AND m.user_id = i.invited_by) AS invited_by
     FROM staff_invites i JOIN shops s ON s.id = i.shop_id
     WHERE i.user_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC`,
    [user.id],
  );
  return rows;
}

async function tellOwners(q: Queryable, now: Date, invite: Invite, title: string, body: string) {
  const owners = await q.query<{ user_id: string }>(`SELECT user_id FROM shop_members WHERE shop_id = $1 AND role = 'owner' AND active`, [invite.shop_id]);
  await queuePush(q, now, { shopId: invite.shop_id, userIds: owners.rows.map((o) => o.user_id).filter((id) => id !== invite.user_id), template: 'staff_invite_answer', title, body, data: { kind: 'team' } });
}

async function pendingFor(q: Queryable, user: User, id: string) {
  const { rows } = await q.query<Invite>(`SELECT * FROM staff_invites WHERE id = $1 AND user_id = $2 AND status = 'pending' FOR UPDATE`, [id, user.id]);
  if (!rows[0]) throw notFound('Invite');
  return rows[0];
}

/** "Katıl": joins the salon's team. */
export async function acceptInvite(deps: Deps, user: User, id: string) {
  const now = deps.clock.now();
  return withTx(deps.db, async (tx) => {
    const invite = await pendingFor(tx, user, id);
    await checkOneSalon(tx, user.id, invite.shop_id, invite.role === 'staff');
    const memberId = await joinShop(tx, invite.shop_id, user.id, { displayName: invite.display_name, role: roleOf(invite), bookable: invite.bookable });
    await tx.query(`UPDATE staff_invites SET status = 'accepted', answered_at = $2 WHERE id = $1`, [id, now]);
    await tellOwners(tx, now, invite, 'Davet kabul edildi', `${invite.display_name} ekibe katıldı.`);
    return { shopId: invite.shop_id, memberId };
  });
}

export async function declineInvite(deps: Deps, user: User, id: string) {
  const now = deps.clock.now();
  await withTx(deps.db, async (tx) => {
    const invite = await pendingFor(tx, user, id);
    await tx.query(`UPDATE staff_invites SET status = 'declined', answered_at = $2 WHERE id = $1`, [id, now]);
    await tellOwners(tx, now, invite, 'Davet reddedildi', `${invite.display_name} ekip davetini kabul etmedi.`);
  });
}
