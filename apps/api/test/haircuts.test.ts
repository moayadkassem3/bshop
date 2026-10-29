import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { currentVersion } from '../src/domain/legal.js';
import { IMAGE_PRESETS, processImage } from '../src/services/photos.js';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const jpeg = () => sharp({ create: { width: 300, height: 400, channels: 3, background: '#334' } }).jpeg().toBuffer();

describe('Popüler kesimler (v1.7)', () => {
  it('salons post their work; customers see it ranked by likes and like it once', async () => {
    const shop = await setupShop(t);
    const post = (style: string, token = shop.tokens.owner) =>
      t.call('POST', `${shop.base}/posts?style=${style}&caption=${encodeURIComponent('Yeni sezon')}`, { token, body: undefined as never, contentType: 'image/jpeg' });
    const upload = async (style: string, token = shop.tokens.owner) =>
      t.call('POST', `${shop.base}/posts?style=${style}&caption=${encodeURIComponent('Yeni sezon')}`, { token, body: await jpeg(), contentType: 'image/jpeg' });

    const fade = await upload('skin-fade');
    expect(fade.status).toBe(201);
    t.clock.advance(60);
    const bob = await upload('bob');
    expect((await upload('not-a-style')).status).toBe(400);
    expect((await post('skin-fade')).status).toBeGreaterThanOrEqual(400);

    // Newest first without likes; the women's filter only shows women's styles.
    let list = (await t.call('GET', '/public/haircuts')).body;
    expect(list.map((p: { id: string }) => p.id)).toEqual([bob.body.id, fade.body.id]);
    expect(list[1]).toMatchObject({ style_name: 'Skin Fade', caption: 'Yeni sezon', shop_slug: shop.slug, like_count: 0 });
    expect((await t.call('GET', '/public/haircuts?audience=women')).body.map((p: { id: string }) => p.id)).toEqual([bob.body.id]);

    // Likes lift a post; liking twice counts once.
    const c1 = await t.login(PHONES.customer);
    const c2 = await t.login(PHONES.customer2);
    for (const token of [c1, c1, c2]) expect((await t.call('PUT', `/me/likes/${fade.body.id}`, { token })).status).toBe(204);
    list = (await t.call('GET', '/public/haircuts')).body;
    expect(list[0]).toMatchObject({ id: fade.body.id, like_count: 2 });
    expect((await t.call('GET', '/me/likes', { token: c1 })).body).toEqual([fade.body.id]);
    await t.call('DELETE', `/me/likes/${fade.body.id}`, { token: c1 });
    expect((await t.call('GET', '/me/likes', { token: c1 })).body).toEqual([]);

    // The photo is served, and the shop's page shows its work.
    const photo = await t.call('GET', `/public/haircut-photos/${fade.body.id}`);
    expect(photo.status).toBe(200);
    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    expect(profile.posts.map((p: { id: string }) => p.id)).toEqual([bob.body.id, fade.body.id]);
  });

  it('staff post too and remove only their own; owners remove any', async () => {
    const shop = await setupShop(t);
    const staff = await t.login(PHONES.cumali, { portal: 'staff' });
    const mine = await t.call('POST', `${shop.base}/posts?style=crop`, { token: staff, body: await jpeg(), contentType: 'image/jpeg' });
    const owners = await t.call('POST', `${shop.base}/posts?style=buzz`, { token: shop.tokens.owner, body: await jpeg(), contentType: 'image/jpeg' });
    expect((await t.call('DELETE', `${shop.base}/posts/${owners.body.id}`, { token: staff })).status).toBe(403);
    expect((await t.call('DELETE', `${shop.base}/posts/${mine.body.id}`, { token: staff })).status).toBe(204);
    expect((await t.call('DELETE', `${shop.base}/posts/${owners.body.id}`, { token: shop.tokens.owner })).status).toBe(204);
    expect((await t.call('GET', '/public/haircuts')).body).toEqual([]);
  });

  it('hides posts of shops that are not public', async () => {
    const shop = await setupShop(t);
    const p = await t.call('POST', `${shop.base}/posts?style=klasik`, { token: shop.tokens.owner, body: await jpeg(), contentType: 'image/jpeg' });
    await t.db.query("UPDATE subscriptions SET status = 'canceled' WHERE shop_id = $1", [shop.shopId]);
    expect((await t.call('GET', '/public/haircuts')).body).toEqual([]);
    const c = await t.login(PHONES.customer);
    expect((await t.call('PUT', `/me/likes/${p.body.id}`, { token: c })).status).toBe(404);
  });
});

describe('booking your own shop (v1.7)', () => {
  it('is refused for the owner and staff, also from customer mode', async () => {
    const shop = await setupShop(t);
    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    const item = { serviceIds: [profile.services[0].id], staffId: null, startsAt: at('16:00') };
    for (const phone of [PHONES.owner, PHONES.cumali]) {
      const token = await t.login(phone, { names: { firstName: 'A', lastName: 'B' } });
      const res = await t.call('POST', `/shops/${shop.slug}/bookings`, { token, body: { items: [item] } });
      expect(res.body.error).toBe('OWN_SHOP');
    }
    const customer = await t.login(PHONES.customer, { names: { firstName: 'C', lastName: 'D' } });
    expect((await t.call('POST', `/shops/${shop.slug}/bookings`, { token: customer, body: { items: [item] } })).status).toBe(201);
  });
});

describe('editing the salon (v1.7)', () => {
  it('owners read and change their salon; Profil knows who owns one', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    const settings = (await t.call('GET', `${shop.base}/settings`, { token: owner })).body;
    expect(settings).toMatchObject({ slug: shop.slug, audience: 'men' });
    const patched = await t.call('PATCH', `${shop.base}/settings`, { token: owner, body: { name: 'Yeni Ad', audience: 'unisex', phone: '0216 555 44 33' } });
    expect(patched.body).toMatchObject({ name: 'Yeni Ad', audience: 'unisex', phone: '+902165554433', slug: shop.slug });

    const staff = await t.login(PHONES.cumali, { portal: 'staff' });
    expect((await t.call('GET', `${shop.base}/settings`, { token: staff })).status).toBe(403);
    expect((await t.call('GET', '/me', { token: owner })).body.owns_shop).toBe(true);
    const mine = (await t.call('GET', '/staff/shops', { token: owner })).body[0];
    expect(mine).toMatchObject({ slug: shop.slug, audience: 'unisex' });
    expect(typeof mine.latitude).toBe('number');
    // The plan follows the bookable staff count (billing seats).
    const members = (await t.call('GET', `${shop.base}/members`, { token: owner })).body as { bookable: boolean; active: boolean }[];
    const seats = members.filter((m) => m.active && m.bookable).length;
    expect(mine).toMatchObject({ seats, plan_id: seats <= 1 ? 'staff-1' : seats <= 2 ? 'staff-2' : seats <= 5 ? 'staff-5' : 'staff-10' });
    expect((await t.call('GET', '/me', { token: staff })).body).toMatchObject({ owns_shop: false, has_business: true });
    const customer = await t.login(PHONES.customer);
    expect((await t.call('GET', '/me', { token: customer })).body).toMatchObject({ owns_shop: false, has_business: false });
  });
});

describe('managing services and staff (v1.7)', () => {
  it('a new service is offered by everyone who takes appointments', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    const created = await t.call('POST', `${shop.base}/services`, { token: owner, body: { name: 'Ense Tıraşı', durationMinutes: 10, priceKurus: 10000 } });
    expect(created.status).toBe(201);
    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    for (const m of profile.staff) expect(m.service_ids).toContain(created.body.id);
    // Removing a service hides it from customers.
    await t.call('PATCH', `${shop.base}/services/${created.body.id}`, { token: owner, body: { active: false } });
    const after = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    expect(after.services.map((s: { id: string }) => s.id)).not.toContain(created.body.id);
  });

  it('a new staff member starts with the salon hours and services; removal is guarded', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    const added = await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: '0532 444 44 44', displayName: 'Emre', role: 'staff' } });
    expect(added.status).toBe(201);
    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    const emre = profile.staff.find((m: { display_name: string }) => m.display_name === 'Emre');
    expect(emre.service_ids.length).toBe(profile.services.length);
    const slots = (await t.call('GET', `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${emre.id}`)).body;
    expect(slots.slots[0].startsAt).toBe(at('10:00'));

    // Someone with an upcoming booking cannot be removed until it is handled.
    const c = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' } });
    await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: emre.id, startsAt: at('16:00') });
    const remove = () => t.call('PATCH', `${shop.base}/members/${added.body.memberId}`, { token: owner, body: { active: false } });
    expect((await remove()).body.error).toBe('MEMBER_HAS_APPOINTMENTS');
    const appts = (await t.call('GET', `${shop.base}/appointments?from=${at('00:00')}&to=${at('23:59')}&staffId=${emre.id}`, { token: owner })).body;
    await t.call('POST', `${shop.base}/appointments/${appts[0].id}/cancel`, { token: owner });
    expect((await remove()).status).toBe(204);

    // Coming back restores the same person instead of failing.
    const again = await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: '0532 444 44 44', displayName: 'Emre', role: 'staff' } });
    expect(again.body.memberId).toBe(added.body.memberId);
  });

  it('staff can become co-owners; the founding owner cannot be removed by a co-owner', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    expect((await t.call('PATCH', `${shop.base}/members/${shop.staff.cumali}`, { token: owner, body: { role: 'co_owner' } })).status).toBe(204);
    const members = (await t.call('GET', `${shop.base}/members`, { token: owner })).body;
    expect(members.find((m: { id: string }) => m.id === shop.staff.cumali)).toMatchObject({ role: 'owner', owner_label: 'co_owner' });
    const cumali = await t.login(PHONES.cumali, { portal: 'owner' });
    const res = await t.call('PATCH', `${shop.base}/members/${shop.staff.salih}`, { token: cumali, body: { active: false } });
    expect(res.status).toBe(403);
  });
});

describe('sign-in with the phone only (v1.7)', () => {
  it('a new customer completes their account once; a returning one goes straight in', async () => {
    const verify = async () => {
      t.clock.advance(2);
      await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer } });
      await t.tick();
      const code = t.sms.to(PHONES.customer).at(-1)!.match(/(\d{6})/)![1];
      return (await t.call('POST', '/auth/otp/verify', { body: { phone: PHONES.customer, code } })).body;
    };
    const first = await verify();
    expect(first).toMatchObject({ needsProfile: true, needsTerms: true });

    // The "Hesabını oluştur" step.
    await t.call('PATCH', '/me', { token: first.token, body: { firstName: 'Elif', lastName: 'Kaya', gender: 'female' } });
    await t.call('POST', '/me/consents', { token: first.token, body: [{ key: 'kullanici-sozlesmesi', version: currentVersion('kullanici-sozlesmesi') }] });

    const again = await verify();
    expect(again).toMatchObject({ needsProfile: false, needsTerms: false, user: { first_name: 'Elif', gender: 'female' } });
  });
});

describe('İstatistikler (v1.7)', () => {
  it('counts page visits by source and the month’s appointments, for owners only', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('09:00', '2026-10-27'));
    const view = (source?: string) => t.call('POST', `/public/shops/${shop.slug}/views`, { body: source ? { source } : {} });
    for (const source of ['kesimler', 'kesimler', 'qr', 'kesfet', 'bilinmeyen', undefined]) expect((await view(source)).status).toBe(204);
    expect((await t.call('POST', '/public/shops/yok-boyle-salon/views', { body: {} })).status).toBe(404);

    const c = await t.login(PHONES.customer, { names: { firstName: 'Ahmet', lastName: 'Yılmaz' } });
    // One request at a time per salon: each is answered before the next.
    const request = async (startsAt: string) => {
      const res = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt });
      expect(res.status).toBe(201);
      return res.body.appointments[0].id as string;
    };
    const owner = shop.tokens.owner;
    await t.call('POST', `${shop.base}/appointments/${await request(at('16:00', '2026-10-28'))}/confirm`, { token: owner });
    await t.call('POST', `${shop.base}/appointments/${await request(at('17:00', '2026-10-29'))}/cancel`, { token: owner });
    await request(at('12:00', '2026-11-02'));

    const stats = (await t.call('GET', `${shop.base}/stats`, { token: shop.tokens.owner })).body;
    expect(stats).toMatchObject({
      month: '2026-10',
      today: '2026-10-27',
      views: { total: 6, bySource: { kesimler: 2, qr: 1, kesfet: 1, diger: 2 } },
      appointments: { total: 1, upcoming: 1, completed: 0, cancelled: 1, noShow: 0 },
    });
    expect(stats.views.daily).toHaveLength(27);
    expect(stats.views.daily.at(-1)).toEqual({ date: '2026-10-27', views: 6 });

    // November's booking is November's; a future month and staff are refused.
    t.clock.set(at('09:00', '2026-11-01'));
    const nov = (await t.call('GET', `${shop.base}/stats`, { token: shop.tokens.owner })).body;
    expect(nov).toMatchObject({ month: '2026-11', views: { total: 0 }, appointments: { total: 1 } });
    expect((await t.call('GET', `${shop.base}/stats?month=2026-10`, { token: shop.tokens.owner })).body.views.total).toBe(6);
    expect((await t.call('GET', `${shop.base}/stats?month=2026-12`, { token: shop.tokens.owner })).status).toBe(400);
    const staff = await t.login(PHONES.cumali, { portal: 'staff' });
    expect((await t.call('GET', `${shop.base}/stats`, { token: staff })).status).toBe(403);
  });
});

describe('Teklif al (v1.7)', () => {
  it('saves a custom-price request, tells our team, and limits repeats', async () => {
    const shop = await setupShop(t);
    const body = { salonName: 'Büyük Salon', contactName: 'Ayşe Kaya', phone: '0532 111 22 33', staffCount: 14, branchCount: 2, city: 'İzmir', message: 'İki şube', source: 'fiyatlar' };
    const res = await t.call('POST', '/public/quote-requests', { body });
    expect(res.status).toBe(201);
    await t.tick();
    expect(t.sms.to(PHONES.admin).at(-1)).toBe('Yeni teklif talebi: Büyük Salon, 14 personel. Tel: +905321112233');

    // A bot filling the hidden field is not saved; a bad phone is refused.
    expect((await t.call('POST', '/public/quote-requests', { body: { ...body, website: 'http://spam' } })).status).toBe(202);
    expect((await t.call('POST', '/public/quote-requests', { body: { ...body, phone: '123' } })).status).toBe(400);

    const list = (await t.call('GET', '/admin/quote-requests', { token: shop.tokens.admin })).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ salon_name: 'Büyük Salon', phone: '+905321112233', staff_count: 14, branch_count: 2, status: 'new' });
    expect((await t.call('GET', '/admin/quote-requests', { token: shop.tokens.owner })).status).toBe(403);

    for (let i = 0; i < 2; i++) expect((await t.call('POST', '/public/quote-requests', { body })).status).toBe(201);
    expect((await t.call('POST', '/public/quote-requests', { body })).status).toBe(429);
  });
});

describe('photo compression (v1.7)', () => {
  const noisy = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#000', noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
      .withMetadata({ exif: { IFD0: { Make: 'Phone' } } })
      .jpeg({ quality: 92 })
      .toBuffer();

  it('scales shop photos to 1600 px and posts to 1280 px, as WebP without metadata', async () => {
    const src = await noisy(4000, 3000);
    const photo = await processImage(src, 'photo');
    const post = await processImage(src, 'post');
    expect(photo.info).toEqual({ width: 1600, height: 1200 });
    expect(post.info).toEqual({ width: 1280, height: 960 });
    const meta = await sharp(photo.data).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(photo.data.length).toBeLessThan(src.length / 5);
  });

  it('encodes a very detailed photo once more at the lower quality, never below it', async () => {
    const src = await noisy(1600, 1200);
    const preset = IMAGE_PRESETS.photo;
    const atDefault = await sharp(src).webp({ quality: preset.quality, effort: 5, smartSubsample: true }).toBuffer();
    const atFloor = await sharp(src).webp({ quality: preset.minQuality, effort: 5, smartSubsample: true }).toBuffer();
    expect(atDefault.length).toBeGreaterThan(preset.maxBytes);
    const out = await processImage(src, 'photo');
    expect(out.data.length).toBe(atFloor.length);
  });
});
