import { describe, expect, it } from 'vitest';
import { PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const DAY = 24 * 60; // TestClock.advance takes minutes

const reminders = () => t.sms.to(PHONES.owner).filter((m) => m.includes('/abonelik'));

describe('subscription reminders and Aboneliğim (v1.7)', () => {
  it('texts the owner before and when the trial ends, each once, with the Aboneliğim link', async () => {
    const shop = await setupShop(t);
    await t.db.query(`UPDATE subscriptions SET status = 'trial', current_period_end = $2 WHERE shop_id = $1`, [
      shop.shopId,
      new Date(t.clock.now().getTime() + (3 * DAY - 60) * 60_000),
    ]);
    await t.tick();
    await t.tick();
    expect(reminders()).toHaveLength(1);
    expect(reminders()[0]).toContain('ücretsiz denemeniz 3 gün sonra bitiyor');
    expect(reminders()[0]).toContain('/abonelik');

    t.clock.advance(2 * DAY);
    await t.tick();
    expect(reminders().at(-1)).toContain('yarın bitiyor');

    t.clock.advance(DAY);
    await t.tick();
    await t.tick();
    expect(reminders().at(-1)).toContain('ücretsiz deneme süreniz bitti');
    expect(reminders()).toHaveLength(3);
  });

  it('stays quiet while the owner has already asked to subscribe', async () => {
    const shop = await setupShop(t);
    await t.db.query(`UPDATE subscriptions SET status = 'trial', current_period_end = $2 WHERE shop_id = $1`, [
      shop.shopId,
      new Date(t.clock.now().getTime() + DAY * 60_000),
    ]);
    await t.call('POST', `/staff/shops/${shop.shopId}/subscription-request`, { token: shop.tokens.owner });
    await t.tick();
    expect(reminders()).toHaveLength(0);
  });

  it('texts before a paid period ends, when it lapses, and when the salon is hidden', async () => {
    const shop = await setupShop(t);
    const paid = await t.call('POST', `/admin/salons/${shop.shopId}/payments`, { token: shop.tokens.admin, body: { amountKurus: 99900, months: 1, method: 'nakit' } });
    const end = new Date(paid.body.periodEnd);

    t.clock.set(new Date(end.getTime() - 2 * DAY * 60_000).toISOString());
    await t.tick();
    expect(reminders().at(-1)).toMatch(/aboneliğiniz .* tarihinde bitiyor/);

    t.clock.set(new Date(end.getTime() + 60_000).toISOString());
    await t.tick();
    await t.tick();
    expect(reminders().at(-1)).toContain('tarihine kadar görünür kalacak');

    t.clock.advance(8 * DAY);
    await t.tick();
    expect(reminders().at(-1)).toContain('salonunuz müşterilere görünmüyor');
    expect(reminders()).toHaveLength(3);
  });

  it('Aboneliğim shows the owner the plan, period and payments; staff cannot see it', async () => {
    const shop = await setupShop(t);
    await t.call('POST', `/admin/salons/${shop.shopId}/payments`, { token: shop.tokens.admin, body: { amountKurus: 99900, months: 1, method: 'havale', note: 'internal' } });
    const mine = (await t.call('GET', `/staff/shops/${shop.shopId}/subscription`, { token: shop.tokens.owner })).body;
    expect(mine).toMatchObject({ status: 'active', visible: true, seats: 3, plan: { id: 'staff-3' } });
    expect(mine.payments[0]).toMatchObject({ amount_kurus: 99900, months: 1, method: 'havale' });
    expect(mine.payments[0].note).toBeUndefined();

    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    expect((await t.call('GET', `/staff/shops/${shop.shopId}/subscription`, { token: cumali })).status).toBe(403);
  });
});
