import { describe, expect, it } from 'vitest';
import { ensureAdmins } from '../src/services/admin.js';
import { PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();

describe('security (v1.7)', () => {
  it('sends sign-in codes only to Turkish mobile numbers', async () => {
    const res = await t.call('POST', '/auth/otp/request', { body: { phone: '+447700900123', portal: 'customer' } });
    expect(res.body.error).toBe('PHONE_NOT_SUPPORTED');
    expect(t.sms.messages).toHaveLength(0);
  });

  it('stops sign-in SMS once the platform-wide hourly cap is reached', async () => {
    await t.db.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at, created_at)
       SELECT '+90544' || lpad(g::text, 7, '0'), 'x', $1, $1 FROM generate_series(1, 300) g`,
      [t.clock.now()],
    );
    const res = await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer, portal: 'customer' } });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('OTP_BUSY');
  });

  it('does not keep sign-in codes readable once sent', async () => {
    await t.login(PHONES.customer);
    const { rows } = await t.db.query("SELECT body FROM notifications WHERE template = 'otp'");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.body).not.toMatch(/\d{6}/);
  });

  it('signing out ends the session on the server', async () => {
    const token = await t.login(PHONES.customer);
    expect((await t.call('GET', '/me', { token })).status).toBe(200);
    expect((await t.call('POST', '/auth/logout', { token })).status).toBe(204);
    expect((await t.call('GET', '/me', { token })).status).toBe(401);
  });

  it('ADMIN_PHONES is the complete list: other admins lose their rights', async () => {
    const shop = await setupShop(t);
    expect((await t.call('GET', '/admin/overview', { token: shop.tokens.admin })).status).toBe(200);
    await ensureAdmins({ ...t.deps, config: { ...t.deps.config, adminPhones: [PHONES.customer2] } });
    expect((await t.call('GET', '/admin/overview', { token: shop.tokens.admin })).status).toBe(403);
  });

  it('texts the team for only a few quote requests an hour', async () => {
    await setupShop(t); // creates an admin
    const admin = (await t.db.query<{ phone: string }>('SELECT phone FROM users WHERE is_platform_admin')).rows[0]!.phone;
    for (let i = 0; i < 8; i++) {
      const res = await t.call('POST', '/public/quote-requests', {
        body: { salonName: `Salon ${i}`, contactName: 'Ad Soyad', phone: `0555 100 00 ${String(10 + i)}`, staffCount: 12 },
      });
      expect(res.status).toBe(201);
    }
    await t.tick();
    expect(t.sms.to(admin).filter((m) => m.startsWith('Yeni teklif talebi'))).toHaveLength(5);
  });
});
