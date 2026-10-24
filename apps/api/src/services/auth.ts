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

export type User = {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  is_platform_admin: boolean;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function requestOtp(deps: Deps, rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone);
  const now = deps.clock.now();
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
  input: { phone: string; code: string; firstName?: string; lastName?: string },
): Promise<{ token: string; user: User }> {
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
    await tx.query('UPDATE otp_codes SET consumed_at = $2 WHERE id = $1', [otp.id, now]);

    const user = (
      await tx.query<User>(
        `INSERT INTO users (phone, first_name, last_name) VALUES ($1, $2, $3)
         ON CONFLICT (phone) DO UPDATE SET
           first_name = COALESCE(EXCLUDED.first_name, users.first_name),
           last_name = COALESCE(EXCLUDED.last_name, users.last_name)
         RETURNING id, phone, first_name, last_name, is_platform_admin`,
        [phone, input.firstName?.trim() || null, input.lastName?.trim() || null],
      )
    ).rows[0]!;

    const token = randomBytes(32).toString('base64url');
    await tx.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
      sha256(token),
      user.id,
      now,
      new Date(now.getTime() + deps.config.sessionDays * 24 * 60 * MINUTE),
    ]);
    return { token, user };
  });
  if (!result) throw badRequest('OTP_INVALID', 'Code is invalid or expired');
  return result;
}

export async function userForToken(deps: Deps, token: string): Promise<User | null> {
  const { rows } = await deps.db.query<User>(
    `SELECT u.id, u.phone, u.first_name, u.last_name, u.is_platform_admin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [sha256(token), deps.clock.now()],
  );
  return rows[0] ?? null;
}

export async function updateProfile(deps: Deps, user: User, input: { firstName: string; lastName: string }) {
  const { rows } = await deps.db.query<User>(
    `UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1
     RETURNING id, phone, first_name, last_name, is_platform_admin`,
    [user.id, input.firstName.trim(), input.lastName.trim()],
  );
  return rows[0]!;
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
