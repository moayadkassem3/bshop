import { describe, expect, it } from 'vitest';
import { ensureAdmins } from '../src/services/admin.js';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();

describe('admin panel (v1.7)', () => {
  it('is for our team only; ADMIN_PHONES become admins at start-up', async () => {
    const shop = await setupShop(t);
    expect((await t.call('GET', '/admin/overview', { token: shop.tokens.owner })).status).toBe(403);
    expect((await t.call('GET', '/admin/overview', { token: shop.tokens.admin })).status).toBe(200);

    await ensureAdmins({ ...t.deps, config: { ...t.deps.config, adminPhones: ['0555 000 00 02'] } });
    const promoted = await t.login(PHONES.customer2);
    expect((await t.call('GET', '/me', { token: promoted })).body.is_platform_admin).toBe(true);
    expect((await t.call('GET', '/admin/overview', { token: promoted })).status).toBe(200);
  });

  it('new salons wait in "Yeni" until checked; a spam salon is taken down and its team sees why', async () => {
    const shop = await setupShop(t);
    const admin = shop.tokens.admin;
    const list = async (filter: string) => (await t.call('GET', `/admin/salons?filter=${filter}`, { token: admin })).body.map((s: { slug: string }) => s.slug);
    expect(await list('yeni')).toEqual([shop.slug]);
    expect((await t.call('GET', '/admin/overview', { token: admin })).body.salons).toMatchObject({ total: 1, live: 1, unchecked: 1 });

    await t.call('PUT', `/admin/salons/${shop.shopId}/checked`, { token: admin, body: { checked: true } });
    expect(await list('yeni')).toEqual([]);

    // Taken down: gone for customers, and the owner is told why.
    await t.call('PUT', `/admin/salons/${shop.shopId}/suspension`, { token: admin, body: { reason: 'Sahte adres ve fotoğraflar' } });
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
    expect(await list('kapali')).toEqual([shop.slug]);
    const mine = (await t.call('GET', '/staff/shops', { token: shop.tokens.owner })).body[0];
    expect(mine).toMatchObject({ visible: false, suspended_reason: 'Sahte adres ve fotoğraflar' });

    // Put back.
    await t.call('PUT', `/admin/salons/${shop.shopId}/suspension`, { token: admin, body: { reason: null } });
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(200);
  });

  it('a recorded payment starts or extends the subscription and closes the request; an unpaid period lapses', async () => {
    const shop = await setupShop(t);
    const admin = shop.tokens.admin;
    // A trial salon asks to subscribe.
    await t.db.query(`UPDATE subscriptions SET status = 'trial', current_period_end = $2 WHERE shop_id = $1`, [shop.shopId, new Date(t.clock.now().getTime() + 86_400_000)]);
    await t.call('POST', `/staff/shops/${shop.shopId}/subscription-request`, { token: shop.tokens.owner });
    expect((await t.call('GET', '/admin/requests', { token: admin })).body.subscriptions[0]).toMatchObject({ shop_id: shop.shopId, handled_at: null });
    expect((await t.call('GET', '/admin/salons?filter=odeme', { token: admin })).body).toHaveLength(1);

    const paid = await t.call('POST', `/admin/salons/${shop.shopId}/payments`, { token: admin, body: { amountKurus: 99900, months: 1, method: 'havale', note: 'Ekim' } });
    expect(paid.status).toBe(201);
    const end = new Date(paid.body.periodEnd);
    expect(Math.round((end.getTime() - t.clock.now().getTime()) / 86_400_000)).toBeGreaterThanOrEqual(30);
    const detail = (await t.call('GET', `/admin/salons/${shop.shopId}`, { token: admin })).body;
    expect(detail).toMatchObject({ subscription_status: 'active', visible: true, open_request_at: null });
    expect(detail.payments[0]).toMatchObject({ amount_kurus: 99900, months: 1, method: 'havale' });
    expect((await t.call('GET', '/admin/overview', { token: admin })).body).toMatchObject({ payments: { this_month: 99900 }, salons: { paying: 1 } });

    // A second payment while the period runs extends it from its end.
    const again = await t.call('POST', `/admin/salons/${shop.shopId}/payments`, { token: admin, body: { amountKurus: 99900, months: 1, method: 'kart' } });
    expect(new Date(again.body.periodEnd).getTime()).toBeGreaterThan(end.getTime() + 27 * 86_400_000);

    // No payment after the period: late with a 7-day grace (still visible), then hidden.
    t.clock.set(new Date(new Date(again.body.periodEnd).getTime() + 60_000).toISOString());
    await t.tick();
    expect((await t.call('GET', `/admin/salons/${shop.shopId}`, { token: admin })).body).toMatchObject({ subscription_status: 'past_due', visible: true });
    t.clock.advance(8 * 24 * 60);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
  });

  it('extends a trial; hides a fake rating so it counts nowhere', async () => {
    const shop = await setupShop(t);
    const admin = shop.tokens.admin;
    await t.db.query(`UPDATE subscriptions SET status = 'trial', current_period_end = $2 WHERE shop_id = $1`, [shop.shopId, t.clock.now()]);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
    await t.call('POST', `/admin/salons/${shop.shopId}/extend-trial`, { token: admin, body: { days: 7 } });
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(200);

    // A rating from a real visit, then hidden by our team.
    const customer = await t.login(PHONES.customer, { names: { firstName: 'Ali', lastName: 'Can' } });
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    t.clock.set(at('09:00', '2026-10-27'));
    const id = (await book(t, shop, customer, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('12:00', '2026-10-27') })).body
      .appointments[0].id;
    await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
    t.clock.set(at('12:40', '2026-10-27'));
    await t.call('POST', `${shop.base}/appointments/${id}/complete`, { token: cumali });
    expect((await t.call('POST', `/me/appointments/${id}/rating`, { token: customer, body: { stars: 1 } })).status).toBe(200);
    const ratings = (await t.call('GET', '/admin/ratings?low=1', { token: admin })).body;
    expect(ratings[0]).toMatchObject({ stars: 1, shop_name: 'Salih Esen Nirvana For Men', hidden_at: null });
    await t.call('PUT', `/admin/ratings/${ratings[0].id}/hidden`, { token: admin, body: { hidden: true } });
    expect((await t.call('GET', `/public/shops/${shop.slug}/ratings`)).body.count).toBe(0);
  });
});
