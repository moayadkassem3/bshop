import { describe, expect, it } from 'vitest';
import { at, book, PHONES, setupShop, useTestApp, type ShopFixture } from './helpers.js';

const t = useTestApp();

const CUSTOMERS = [
  { phone: PHONES.customer, names: { firstName: 'Ayşe', lastName: 'Kaya' } },
  { phone: PHONES.customer2, names: { firstName: 'Mehmet', lastName: 'Demir' } },
  { phone: '+905550000003', names: { firstName: 'Zeynep', lastName: 'Ak' } },
];

/** A booked, confirmed and completed ("Geldi") visit on `date`; returns its id. */
async function visit(shop: ShopFixture, token: string, date: string, extra: { guestName?: string } = {}) {
  const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
  t.clock.set(at('09:00', date));
  const res = await book(t, shop, token, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('12:00', date), ...extra });
  const id = res.body.appointments[0].id as string;
  await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
  t.clock.set(at('12:40', date));
  await t.call('POST', `${shop.base}/appointments/${id}/complete`, { token: cumali });
  return id;
}

const rate = (token: string, id: string, stars: number) => t.call('POST', `/me/appointments/${id}/rating`, { token, body: { stars } });

describe('salon ratings (v1.7)', () => {
  it('only a completed visit of your own can be rated, within 14 days; rating again changes it', async () => {
    const shop = await setupShop(t);
    const me = await t.login(CUSTOMERS[0]!.phone, { names: CUSTOMERS[0]!.names });

    // Not yet visited.
    t.clock.set(at('09:00', '2026-10-27'));
    const upcoming = (await book(t, shop, me, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('12:00', '2026-10-27') })).body
      .appointments[0].id;
    expect((await rate(me, upcoming, 5)).body.error).toBe('NOT_RATEABLE');
    await t.call('POST', `/me/appointments/${upcoming}/cancel`, { token: me });

    const id = await visit(shop, me, '2026-10-28');
    const mine = (await t.call('GET', '/me/appointments', { token: me })).body.find((a: { id: string }) => a.id === id);
    expect(mine).toMatchObject({ rateable: true, my_rating: null });

    expect((await rate(me, id, 4)).status).toBe(200);
    expect((await rate(me, id, 5)).body).toMatchObject({ stars: 5 });
    expect((await t.db.query('SELECT count(*)::int AS n FROM shop_ratings')).rows[0].n).toBe(1);

    // Someone else cannot rate it; and after 14 days nobody can.
    const other = await t.login(CUSTOMERS[1]!.phone, { names: CUSTOMERS[1]!.names });
    expect((await rate(other, id, 1)).status).toBe(404);
    t.clock.set(at('13:00', '2026-11-12'));
    expect((await rate(me, id, 3)).body.error).toBe('RATING_CLOSED');

    // The owners heard about the new rating.
    await t.tick();
    const salih = (await t.db.query('SELECT user_id FROM shop_members WHERE id = $1', [shop.staff.salih])).rows[0].user_id;
    expect(t.push.to(salih).some((m) => m.title === 'Yeni değerlendirme')).toBe(true);
  });

  it("a guest's visit is not the booker's to rate", async () => {
    const shop = await setupShop(t);
    const me = await t.login(CUSTOMERS[0]!.phone, { names: CUSTOMERS[0]!.names });
    const id = await visit(shop, me, '2026-10-28', { guestName: 'Oğlum Can' });
    expect((await rate(me, id, 5)).body.error).toBe('NOT_RATEABLE');
  });

  it('the average shows from 3 customers, counting each customer once; owners reply publicly', async () => {
    const shop = await setupShop(t);
    const tokens = [];
    for (const c of CUSTOMERS) tokens.push(await t.login(c.phone, { names: c.names }));

    // Ayşe comes twice: only her latest rating counts.
    await rate(tokens[0]!, await visit(shop, tokens[0]!, '2026-10-27'), 1);
    await rate(tokens[0]!, await visit(shop, tokens[0]!, '2026-10-28'), 5);
    await rate(tokens[1]!, await visit(shop, tokens[1]!, '2026-10-29'), 4);

    let pub = (await t.call('GET', `/public/shops/${shop.slug}/ratings`)).body;
    expect(pub).toMatchObject({ count: 2, rating: null });
    expect(pub.average).toBeUndefined();
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).body).toMatchObject({ rating: null, ratingCount: 2 });

    await rate(tokens[2]!, await visit(shop, tokens[2]!, '2026-10-30'), 3);
    pub = (await t.call('GET', `/public/shops/${shop.slug}/ratings`)).body;
    expect(pub).toMatchObject({ count: 3, rating: 4, distribution: [1, 1, 1, 0, 0] });
    expect(pub.ratings.map((r: { customer: string; stars: number }) => `${r.customer} ${r.stars}`)).toEqual(['Zeynep A. 3', 'Mehmet D. 4', 'Ayşe K. 5']);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).body).toMatchObject({ rating: 4, ratingCount: 3 });

    // Keşfet shows it too.
    const near = (await t.call('GET', '/public/nearby?lat=40.99&lng=29.03')).body;
    expect(near.find((s: { slug: string }) => s.slug === shop.slug)).toMatchObject({ rating: 4, rating_count: 3 });

    // Owners answer; staff can read but not answer.
    const team = (await t.call('GET', `${shop.base}/ratings`, { token: shop.tokens.owner })).body;
    expect(team).toMatchObject({ count: 3, average: 4, minimum: 3 });
    const target = team.ratings.find((r: { stars: number }) => r.stars === 3).id;
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    expect((await t.call('PUT', `${shop.base}/ratings/${target}/reply`, { token: cumali, body: { text: 'Teşekkürler' } })).status).toBe(403);
    expect((await t.call('PUT', `${shop.base}/ratings/${target}/reply`, { token: shop.tokens.owner, body: { text: 'Geri bildiriminiz için teşekkürler, bir dahakine daha iyi!' } })).status).toBe(204);
    pub = (await t.call('GET', `/public/shops/${shop.slug}/ratings`)).body;
    expect(pub.ratings[0]).toMatchObject({ customer: 'Zeynep A.', reply: 'Geri bildiriminiz için teşekkürler, bir dahakine daha iyi!' });

    // Removing the answer.
    await t.call('PUT', `${shop.base}/ratings/${target}/reply`, { token: shop.tokens.owner, body: { text: '' } });
    expect((await t.call('GET', `/public/shops/${shop.slug}/ratings`)).body.ratings[0].reply).toBeNull();
  });
});
