import { describe, expect, it } from 'vitest';
import { currentVersion } from '../src/domain/legal.js';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();

/** A fresh sign-in, bypassing the helper's per-phone token cache. */
async function signInAgain(phone: string) {
  t.clock.advance(1);
  await t.call('POST', '/auth/otp/request', { body: { phone, portal: 'customer' } });
  await t.tick();
  const code = t.sms.to(phone).at(-1)!.match(/(\d{6})/)![1];
  const res = await t.call('POST', '/auth/otp/verify', {
    body: { phone, code, portal: 'customer', consents: [{ key: 'kullanici-sozlesmesi', version: currentVersion('kullanici-sozlesmesi') }] },
  });
  return res.body.token as string;
}

describe('account deletion (v1.7)', () => {
  it('a customer: bookings ahead are cancelled and the salon told; personal data goes; the number is free again', async () => {
    const shop = await setupShop(t);
    const me = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    const booked = await book(t, shop, me, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    expect(booked.status).toBe(201);
    await t.call('POST', `/me/favorites/${shop.slug}`, { token: me });

    expect((await t.call('GET', '/me/deletion', { token: me })).body).toEqual({ cancels: 1, leaves: [], handsOver: [], closes: [], blockers: [] });
    expect((await t.call('DELETE', '/me', { token: me })).status).toBe(204);

    // Signed out, and the salon sees the cancellation without the person's name.
    expect((await t.call('GET', '/me', { token: me })).status).toBe(401);
    const appt = (await t.db.query('SELECT status, customer_name, customer_phone FROM appointments WHERE customer_id IS NOT NULL')).rows[0];
    expect(appt).toEqual({ status: 'cancelled', customer_name: 'Silinmiş müşteri', customer_phone: null });
    await t.tick();
    const cumali = (await t.db.query('SELECT user_id FROM shop_members WHERE id = $1', [shop.staff.cumali])).rows[0].user_id;
    expect(t.push.to(cumali).at(-1)?.title).toBeTruthy();

    const user = (await t.db.query('SELECT phone, first_name, deleted_at FROM users WHERE deleted_at IS NOT NULL')).rows[0];
    expect(user.phone).toMatch(/^silindi:/);
    expect(user.first_name).toBeNull();
    expect((await t.db.query('SELECT count(*)::int AS n FROM customer_favorites')).rows[0].n).toBe(0);

    // Signing in with the same number starts a new, empty account.
    const again = await signInAgain(PHONES.customer);
    expect((await t.call('GET', '/me', { token: again })).status).toBe(200);
    expect((await t.call('GET', '/me/appointments', { token: again })).body).toEqual([]);
  });

  it('staff with appointments ahead must hand them over first', async () => {
    const shop = await setupShop(t);
    const customer = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    await book(t, shop, customer, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });

    const plan = (await t.call('GET', '/me/deletion', { token: cumali })).body;
    expect(plan.blockers).toEqual([{ code: 'HAS_UPCOMING_WORK', shopId: shop.shopId, name: 'Salih Esen Nirvana For Men', count: 1 }]);
    const refused = await t.call('DELETE', '/me', { token: cumali });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'HAS_UPCOMING_WORK', count: 1 });

    // Tahir has nothing booked: he leaves the team and the salon carries on.
    const tahir = await t.login(PHONES.tahir, { portal: 'staff' });
    expect((await t.call('DELETE', '/me', { token: tahir })).status).toBe(204);
    expect((await t.db.query('SELECT active FROM shop_members WHERE id = $1', [shop.staff.tahir])).rows[0].active).toBe(false);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(200);
  });

  it("a founder alone closes the salon, but only once its bookings are dealt with", async () => {
    const shop = await setupShop(t);
    const customer = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    const booked = await book(t, shop, customer, { serviceIds: [shop.services.haircut], staffId: shop.staff.tahir, startsAt: at('16:00') });

    let plan = (await t.call('GET', '/me/deletion', { token: shop.tokens.owner })).body;
    expect(plan.closes).toEqual([{ shopId: shop.shopId, name: 'Salih Esen Nirvana For Men' }]);
    expect(plan.blockers[0]).toMatchObject({ code: 'SHOP_HAS_APPOINTMENTS', count: 1 });
    expect((await t.call('DELETE', '/me', { token: shop.tokens.owner })).status).toBe(409);

    await t.call('POST', `${shop.base}/appointments/${booked.body.appointments[0].id}/cancel`, { token: shop.tokens.owner, body: {} });
    plan = (await t.call('GET', '/me/deletion', { token: shop.tokens.owner })).body;
    expect(plan.blockers).toEqual([]);
    expect((await t.call('DELETE', '/me', { token: shop.tokens.owner })).status).toBe(204);

    // Gone for customers; the team no longer has access.
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' }).catch(() => null);
    if (cumali) expect((await t.call('GET', '/staff/shops', { token: cumali })).body).toEqual([]);
  });

  it('a founder with a co-owner hands the salon over', async () => {
    const shop = await setupShop(t);
    await t.call('PATCH', `${shop.base}/members/${shop.staff.cumali}`, { token: shop.tokens.owner, body: { role: 'co_owner' } });

    const plan = (await t.call('GET', '/me/deletion', { token: shop.tokens.owner })).body;
    expect(plan.handsOver).toEqual([{ shopId: shop.shopId, name: 'Salih Esen Nirvana For Men', to: 'Cumali Esen' }]);
    expect((await t.call('DELETE', '/me', { token: shop.tokens.owner })).status).toBe(204);

    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(200);
    const members = (await t.db.query('SELECT id, owner_label, active FROM shop_members WHERE shop_id = $1 ORDER BY created_at', [shop.shopId])).rows;
    expect(members.find((m) => m.id === shop.staff.cumali)).toMatchObject({ owner_label: 'owner', active: true });
    expect(members.find((m) => m.id === shop.staff.salih)).toMatchObject({ owner_label: null, active: false });
  });
});
