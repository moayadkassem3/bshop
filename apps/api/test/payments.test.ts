import { describe, expect, it } from 'vitest';
import { PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const ACCOUNT = { holder: 'Salon Randevu', bank: 'Örnek Bank', iban: 'TR000000000000000000000000' };

describe('paying by EFT / Havale on the website (founder, 12 November 2026)', () => {
  it('shows what to pay and what to write; card options are closed', async () => {
    const shop = await setupShop(t);
    // Without our bank details the transfer option is closed too.
    t.deps.config.paymentAccount = null;
    const closed = (await t.call('GET', `${shop.base}/payment`, { token: shop.tokens.owner })).body;
    expect(closed.methods.map((m: { id: string; enabled: boolean }) => [m.id, m.enabled])).toEqual([['havale', false], ['iyzico', false], ['kart', false]]);
    expect((await t.call('POST', `${shop.base}/payment-notices`, { token: shop.tokens.owner, body: { months: 1 } })).body.error).toBe('PAYMENT_NOT_READY');

    t.deps.config.paymentAccount = ACCOUNT;
    const page = (await t.call('GET', `${shop.base}/payment`, { token: shop.tokens.owner })).body;
    expect(page).toMatchObject({ plan: { id: 'staff-3', monthlyPriceKurus: 100_000 }, reference: '05320000001', account: ACCOUNT, months: [1, 3, 6, 12], pendingNotice: null });
    expect(page.methods[0]).toEqual({ id: 'havale', label: 'EFT / Havale', enabled: true });

    // Staff cannot see or pay.
    const staff = await t.login(PHONES.cumali, { portal: 'staff' });
    expect((await t.call('GET', `${shop.base}/payment`, { token: staff })).status).toBe(403);
  });

  it('a notice reaches our team; confirming it records the payment, extends the subscription and tells the owner', async () => {
    const shop = await setupShop(t);
    t.deps.config.paymentAccount = ACCOUNT;
    const owner = shop.tokens.owner;
    const sent = await t.call('POST', `${shop.base}/payment-notices`, { token: owner, body: { months: 3 } });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ months: 3, amount_kurus: 300_000, reference: '05320000001', status: 'pending' });
    expect((await t.call('POST', `${shop.base}/payment-notices`, { token: owner, body: { months: 1 } })).body.error).toBe('PAYMENT_NOTICE_EXISTS');
    expect((await t.call('POST', `${shop.base}/payment-notices`, { token: owner, body: { months: 2 } })).status).toBe(400);
    await t.tick();
    expect(t.sms.to(PHONES.admin).at(-1)).toBe('Havale bildirimi: Salih Esen Nirvana For Men, ₺3.000, 3 ay. Açıklama: 05320000001');

    const admin = shop.tokens.admin;
    expect((await t.call('GET', '/admin/payment-notices', { token: owner })).status).toBe(403);
    const [notice] = (await t.call('GET', '/admin/payment-notices', { token: admin })).body;
    expect(notice).toMatchObject({ id: sent.body.id, status: 'pending', reference: '05320000001', amount_kurus: 300_000 });

    const before = (await t.db.query('SELECT current_period_end FROM subscriptions WHERE shop_id = $1', [shop.shopId])).rows[0].current_period_end as Date;
    const confirmed = await t.call('POST', `/admin/payment-notices/${notice.id}/confirm`, { token: admin });
    expect(confirmed.status).toBe(200);
    const sub = (await t.db.query('SELECT status, current_period_end FROM subscriptions WHERE shop_id = $1', [shop.shopId])).rows[0];
    expect(sub.status).toBe('active');
    expect(sub.current_period_end.getTime()).toBeGreaterThan(Math.max(before?.getTime() ?? 0, t.clock.now().getTime()) + 85 * 86_400_000);
    const payments = (await t.call('GET', `${shop.base}/subscription`, { token: owner })).body.payments;
    expect(payments[0]).toMatchObject({ amount_kurus: 300_000, months: 3, method: 'havale' });
    await t.tick();
    expect(t.sms.to(PHONES.owner).at(-1)).toMatch(/ödemeniz alındı, teşekkür ederiz\. Aboneliğiniz .* tarihine kadar aktif\.$/);
    // Answered once only.
    expect((await t.call('POST', `/admin/payment-notices/${notice.id}/confirm`, { token: admin })).status).toBe(404);
    expect((await t.call('GET', `${shop.base}/payment`, { token: owner })).body).toMatchObject({ pendingNotice: null, lastNotice: { status: 'confirmed' } });
  });

  it('a transfer that cannot be found is rejected with an SMS; a notice can be taken back', async () => {
    const shop = await setupShop(t);
    t.deps.config.paymentAccount = ACCOUNT;
    const owner = shop.tokens.owner;
    const first = await t.call('POST', `${shop.base}/payment-notices`, { token: owner, body: { months: 1 } });
    expect((await t.call('DELETE', `${shop.base}/payment-notices/${first.body.id}`, { token: owner })).status).toBe(204);
    expect((await t.call('GET', '/admin/payment-notices', { token: shop.tokens.admin })).body).toEqual([]);

    const second = await t.call('POST', `${shop.base}/payment-notices`, { token: owner, body: { months: 1 } });
    expect((await t.call('POST', `/admin/payment-notices/${second.body.id}/reject`, { token: shop.tokens.admin })).status).toBe(204);
    await t.tick();
    expect(t.sms.to(PHONES.owner).at(-1)).toContain('bildirdiğiniz ödeme hesabımızda görünmüyor. Açıklamaya telefon numaranızı yazdığınızdan emin olun: ');
    expect((await t.db.query('SELECT count(*)::int AS n FROM payments WHERE shop_id = $1', [shop.shopId])).rows[0].n).toBe(0);
  });

  it('the payment-request SMS goes to the owner from Yönetim, once a day', async () => {
    const shop = await setupShop(t);
    const send = () => t.call('POST', `/admin/salons/${shop.shopId}/payment-request`, { token: shop.tokens.admin });
    expect((await send()).body).toEqual({ sentTo: '05320000001' });
    await t.tick();
    expect(t.sms.to(PHONES.owner).at(-1)).toMatch(/^Salih Esen Nirvana For Men: 3 Personel aboneliğinizin aylık ücreti ₺1\.000\. EFT\/Havale ile ödemek için: .*\/abonelik\/odeme$/);
    expect((await send()).body.error).toBe('ALREADY_SENT_TODAY');
    expect((await t.call('POST', `/admin/salons/${shop.shopId}/payment-request`, { token: shop.tokens.owner })).status).toBe(403);
  });
});
