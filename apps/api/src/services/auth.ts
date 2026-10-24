import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Deps } from '../deps.js';
import { withTx, type Queryable } from '../db.js';
import { AppError, badRequest } from '../errors.js';
import { sms } from '../messages.js';
import { queueSms } from '../notifications.js';
import { normalizePhone } from '../phone.js';
import { MINUTE } from '../domain/time.js';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_PER_HOUR = 5;

/**
 * Which entrance a session was started from: the customer website, staff sign-in
 * ("Çalışan Girişi"), or owner sign-in ("Salon Sahibi Girişi").
 */
export type Portal = 'customer' | 'staff' | 'owner';

export type User = {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  is_platform_admin: boolean;
  portal: Portal;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Staff and owner sign-in only accept phones with that role in an active shop membership. */
async function assertPortalAllowed(q: Queryable, phone: string, portal: Portal) {
  if (portal === 'customer') return;
  const { rowCount } = await q.query(
    `SELECT 1 FROM users u JOIN shop_members m ON m.user_id = u.id
     WHERE u.phone = $1 AND m.active AND m.role = $2 LIMIT 1`,
    [phone, portal],
  );
  if (!rowCount) {
    throw portal === 'owner'
      ? new AppError(403, 'NOT_OWNER', 'This number is not registered as a salon owner')
      : new AppError(403, 'NOT_STAFF', 'This number is not registered as salon staff');
  }
}

export async function requestOtp(deps: Deps, rawPhone: string, portal: Portal = 'customer'): Promise<void> {
  const phone = normalizePhone(rawPhone);
  const now = deps.clock.now();
  // Checked before any SMS is sent, so wrong-entrance attempts cost nothing.
  await assertPortalAllowed(deps.db, phone, portal);
  await withTx(deps.db, async (tx) => {
    // Serialise requests per phone so the rate limits hold under concurrency.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    const { rows } = await tx.query<{ last: Date | null; hour_count: number }>(
      `SELECT max(created_at) AS last, count(*)::int AS hour_count
       FROM otp_codes WHERE phone = $1 AND created_at > $2`,
      [phone, new Date(now.getTime() - 60 * MINUTE)],
    );
    const { last, hour_count } = rows[0]!;
    if (last && now.getTime() - last.getTime() < OTP_RESEND_SECONDS * 1000) {
      throw new AppError(429, 'OTP_TOO_SOON', 'Wait a minute before requesting another code');
    }
    if (hour_count >= OTP_MAX_PER_HOUR) throw new AppError(429, 'OTP_LIMIT', 'Too many codes requested');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await tx.query(
      'INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4)',
      [phone, sha256(`${deps.config.otpSecret}:${phone}:${code}`), new Date(now.getTime() + OTP_TTL_MINUTES * MINUTE), now],
    );
    await queueSms(tx, now, { shopId: null, phone, template: 'otp', body: sms.otp(code) });
  });
}

export async function verifyOtp(
  deps: Deps,
  input: { phone: string; code: string; firstName?: string; lastName?: string; portal?: Portal },
): Promise<{ token: string; user: User }> {
  const portal = input.portal ?? 'customer';
  const phone = normalizePhone(input.phone);
  const now = deps.clock.now();
  const result = await withTx(deps.db, async (tx) => {
    const { rows } = await tx.query<{ id: string; code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT id, code_hash, expires_at, attempts FROM otp_codes
       WHERE phone = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone],
    );
    const otp = rows[0];
    if (!otp || otp.expires_at <= now || otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw badRequest('OTP_INVALID', 'Code is invalid or expired');
    }
    const expected = Buffer.from(otp.code_hash, 'hex');
    const actual = Buffer.from(sha256(`${deps.config.otpSecret}:${phone}:${input.code}`), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      // Commit the failed attempt, then fail outside the transaction.
      await tx.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      return null;
    }
    await assertPortalAllowed(tx, phone, portal);
    await tx.query('UPDATE otp_codes SET consumed_at = $2 WHERE id = $1', [otp.id, now]);

    const row = (
      await tx.query<Omit<User, 'portal'>>(
        `INSERT INTO users (phone, first_name, last_name) VALUES ($1, $2, $3)
         ON CONFLICT (phone) DO UPDATE SET
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name = COALESCE(EXCLUDED.last_name, users.last_name)
         RETURNING id, phone, first_name, last_name, is_platform_admin`,
        [phone, input.firstName?.trim() || null, input.lastName?.trim() || null],
      )
    ).rows[0]!;
    const user: User = { ...row, portal };

    const token = randomBytes(32).toString('base64url');
    await tx.query(
      'INSERT INTO sessions (token_hash, user_id, portal, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [sha256(token), user.id, portal, now, new Date(now.getTime() + deps.config.sessionDays * 24 * 60 * MINUTE)],
    );
    return { token, user };
  });
  if (!result) throw badRequest('OTP_INVALID', 'Code is invalid or expired');
  return result;
}

export async function userForToken(deps: Deps, token: string): Promise<User | null> {
  const { rows } = await deps.db.query<User>(
    `SELECT u.id, u.phone, u.first_name, u.last_name, u.is_platform_admin, s.portal
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [sha256(token), deps.clock.now()],
  );
  return rows[0] ?? null;
}

export async function updateProfile(deps: Deps, user: User, input: { firstName: string; lastName: string }) {
  const { rows } = await deps.db.query<Omit<User, 'portal'>>(
    `UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1
     RETURNING id, phone, first_name, last_name, is_platform_admin`,
    [user.id, input.firstName.trim(), input.lastName.trim()],
  );
  return { ...rows[0]!, portal: user.portal };
}

/** Finds or creates a user by phone (used when owners add staff, or staff enter a customer). */
export async function upsertUserByPhone(
  q: Queryable,
  phone: string,
  firstName?: string | null,
  lastName?: string | null,
): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO users (phone, first_name, last_name) VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET
       first_name = COALESCE(users.first_name, EXCLUDED.first_name),
       last_name = COALESCE(users.last_name, EXCLUDED.last_name)
     RETURNING id`,
    [phone, firstName ?? null, lastName ?? null],
  );
  return rows[0]!.id;
}
