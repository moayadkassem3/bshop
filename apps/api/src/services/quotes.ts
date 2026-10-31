import type { Deps } from '../deps.js';
import { withTx } from '../db.js';
import { AppError } from '../errors.js';
import { sms } from '../messages.js';
import { queueSms } from '../notifications.js';
import { normalizePhone } from '../phone.js';
import { requirePlatformAdmin } from './access.js';
import type { User } from './auth.js';

export type QuoteRequestInput = {
  salonName: string;
  contactName: string;
  phone: string;
  email?: string | null;
  staffCount: number;
  branchCount: number;
  city?: string | null;
  message?: string | null;
  source: 'fiyatlar' | 'kayit' | 'ayarlar';
};

const PER_PHONE_PER_DAY = 3;

/** A custom-price request (more than 10 staff): saved, and our team is told by SMS. */
export async function createQuoteRequest(deps: Deps, input: QuoteRequestInput, user: User | null) {
  const now = deps.clock.now();
  const phone = normalizePhone(input.phone);
  return withTx(deps.db, async (tx) => {
    const recent = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM quote_requests WHERE phone = $1 AND created_at > $2`,
      [phone, new Date(now.getTime() - 86_400_000)],
    );
    if (recent.rows[0]!.n >= PER_PHONE_PER_DAY) throw new AppError(429, 'QUOTE_LIMIT', 'Too many requests from this number today');
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO quote_requests (salon_name, contact_name, phone, email, staff_count, branch_count, city, message, source, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        input.salonName.trim(),
        input.contactName.trim(),
        phone,
        input.email?.trim() || null,
        input.staffCount,
        input.branchCount,
        input.city?.trim() || null,
        input.message?.trim() || null,
        input.source,
        user?.id ?? null,
        now,
      ],
    );
    const admins = await tx.query<{ id: string; phone: string }>('SELECT id, phone FROM users WHERE is_platform_admin');
    for (const admin of admins.rows) {
      await queueSms(tx, now, {
        shopId: null,
        userId: admin.id,
        phone: admin.phone,
        template: 'quoteRequest',
        body: sms.quoteRequest({ salon: input.salonName.trim(), staff: input.staffCount, phone }),
      });
    }
    return { id: rows[0]!.id };
  });
}

/** For our team (and the admin panel): newest first. */
export async function listQuoteRequests(deps: Deps, admin: User) {
  requirePlatformAdmin(admin);
  const { rows } = await deps.db.query(
    `SELECT id, salon_name, contact_name, phone, email, staff_count, branch_count, city, message, source, status, created_at
     FROM quote_requests ORDER BY created_at DESC LIMIT 200`,
  );
  return rows;
}
