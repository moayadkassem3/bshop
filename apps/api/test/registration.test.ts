import { describe, expect, it } from 'vitest';
import { currentVersion } from '../src/domain/legal.js';
import { slugify } from '../src/domain/slug.js';
import { databaseStorage } from '../src/storage.js';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const businessConsents = ['isletme-sozlesmesi', 'veri-isleme-sozlesmesi'].map((key) => ({ key, version: currentVersion(key) }));

function registration(overrides: Record<string, unknown> = {}) {
  return {
    audience: 'men',
    name: 'Çağrı Erkek Kuaförü',
    phone: '0216 555 44 33',
    whatsapp: '0532 111 11 11',
    instagram: '@cagrikuafor',
    city: 'Ankara',
    district: 'Çankaya',
    address: 'Kızılay Mah. Atatürk Blv. No: 10',
    latitude: 39.92,
    longitude: 32.85,
    hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 600, endMinute: 1200 })),
    services: [
      { catalogId: 1, priceKurus: 40000 },
      { name: 'Ense Tıraşı', durationMinutes: 10, priceKurus: 10000 },
    ],
    owner: { displayName: 'Çağrı Usta', bookable: true },
    members: [
      { displayName: 'Mert', phone: '0532 222 22 22', role: 'staff', bookable: true },
      { displayName: 'Ayşe', phone: '0532 333 33 33', role: 'co_owner', bookable: false },
    ],
    consents: businessConsents,
    ...overrides,
  };
}

async function admin() {
  await t.db.query(
    `INSERT INTO users (phone, first_name, last_name, is_platform_admin) VALUES ($1, 'Platform', 'Admin', true) ON CONFLICT DO NOTHING`,
    [PHONES.admin],
  );
  return t.login(PHONES.admin);
}

describe('self-service shop registration (v1.6)', () => {
  it('creates a hidden shop the registrant owns, with staff, a co-owner, services and hours', async () => {
    const me = await t.login(PHONES.customer, { names: { firstName: 'Çağrı', lastName: 'Yılmaz' } });
    const r = await t.call('POST', '/registrations', { token: me, body: registration() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ slug: 'cagri-erkek-kuaforu', staffCount: 2 });

    // Hidden until reviewed.
    expect((await t.call('GET', `/public/shops/${r.body.slug}`)).status).toBe(404);

    // The returned token is an owner session: the owner can add photos and see the team right away.
    const base = `/staff/shops/${r.body.shopId}`;
    const members = (await t.call('GET', `${base}/members`, { token: r.body.token })).body;
    expect(members.map((m: { display_name: string; role: string; owner_label: string | null; bookable: boolean }) => [m.display_name, m.role, m.owner_label, m.bookable])).toEqual([
      ['Çağrı Usta', 'owner', 'owner', true],
      ['Ayşe', 'owner', 'co_owner', false],
      ['Mert', 'staff', null, true],
    ]);
    const shops = (await t.call('GET', '/staff/shops', { token: r.body.token })).body;
    expect(shops[0]).toMatchObject({ reviewed_at: null, subscription_status: 'none' });

    // Approval starts the 7-day trial and makes the shop public and bookable.
    await t.call('POST', `/admin/shops/${r.body.shopId}/review`, { token: await admin() });
    await t.tick();
    expect(t.sms.to(PHONES.customer).at(-1)).toContain('onaylandı ve artık randevu alıyor. 7 günlük ücretsiz deneme');
    const profile = (await t.call('GET', `/public/shops/${r.body.slug}`)).body;
    expect(profile.services.map((s: { name: string }) => s.name)).toEqual(['Saç Kesimi', 'Ense Tıraşı']);
    expect(profile.staff.map((s: { display_name: string }) => s.display_name)).toEqual(['Çağrı Usta', 'Mert']);
    expect(profile.instagram).toBe('cagrikuafor');
    expect(profile.phone).toBe('+902165554433');
    const customer = await t.login(PHONES.customer2, { names: { firstName: 'M', lastName: 'K' } });
    const booked = await book(t, { slug: r.body.slug } as never, customer, {
      serviceIds: [profile.services[0].id],
      staffId: null,
      startsAt: at('16:00'),
    });
    expect(booked.status).toBe(201);

    // The trial ends after 7 days.
    t.clock.advance(7 * 24 * 60 + 1);
    expect((await t.call('GET', `/public/shops/${r.body.slug}`)).status).toBe(404);
  });

  it('records the business agreements with their versions', async () => {
    const me = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' } });
    await t.call('POST', '/registrations', { token: me, body: registration() });
    const consents = (await t.call('GET', '/me/consents', { token: me })).body;
    expect(consents.map((c: { document_key: string }) => c.document_key).sort()).toEqual([
      'isletme-sozlesmesi',
      'kullanici-sozlesmesi',
      'veri-isleme-sozlesmesi',
    ]);
  });

  it('refuses missing agreements, duplicate phones, no staff, and a second pending registration', async () => {
    const me = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' } });
    const call = (body: object) => t.call('POST', '/registrations', { token: me, body });
    expect((await call(registration({ consents: [businessConsents[0]] }))).body.error).toBe('CONSENT_REQUIRED');
    expect(
      (await call(registration({ members: [{ displayName: 'Ben', phone: PHONES.customer, role: 'staff', bookable: true }] }))).body.error,
    ).toBe('DUPLICATE_MEMBER');
    expect((await call(registration({ owner: { displayName: 'X', bookable: false }, members: [] }))).body.error).toBe('NO_STAFF');
    expect(
      (await call(registration({ consents: [{ key: 'isletme-sozlesmesi', version: '2020-01-01' }, businessConsents[1]] }))).body.error,
    ).toBe('OUTDATED_DOCUMENT');

    expect((await call(registration())).status).toBe(201);
    expect((await call(registration({ name: 'İkinci Salon' }))).body.error).toBe('REGISTRATION_PENDING');
  });

  it('gives each shop a free link from its name', async () => {
    expect(slugify('Salih Esen Nirvana For✂Men')).toBe('salih-esen-nirvana-for-men');
    expect(slugify('Şık Saçlar Güzellik')).toBe('sik-saclar-guzellik');
    expect(slugify('Ö')).toBe('kuafor-o');
    const a = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' } });
    const b = await t.login(PHONES.customer2, { names: { firstName: 'C', lastName: 'D' } });
    const first = await t.call('POST', '/registrations', { token: a, body: registration({ name: 'Profil' }) });
    const second = await t.call('POST', '/registrations', {
      token: b,
      body: registration({ name: 'Profil', members: [], phone: '0532 999 99 99' }),
    });
    expect([first.body.slug, second.body.slug]).toEqual(['profil-2', 'profil-3']);
  });
});

describe('agreements at sign-up (v1.6)', () => {
  it('booking needs the user agreement; it can be accepted later', async () => {
    const shop = await setupShop(t);
    const c = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' }, acceptTerms: false });
    const item = { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') };
    expect((await book(t, shop, c, item)).body.error).toBe('TERMS_REQUIRED');
    await t.call('POST', '/me/consents', { token: c, body: [{ key: 'kullanici-sozlesmesi', version: currentVersion('kullanici-sozlesmesi') }] });
    expect((await book(t, shop, c, item)).status).toBe(201);
  });

  it('marketing consent is optional and can be withdrawn; required ones cannot', async () => {
    const c = await t.login(PHONES.customer);
    await t.call('POST', '/me/consents', { token: c, body: [{ key: 'ticari-ileti-izni', version: currentVersion('ticari-ileti-izni') }] });
    expect((await t.call('POST', '/me/consents/ticari-ileti-izni/withdraw', { token: c })).status).toBe(204);
    const list = (await t.call('GET', '/me/consents', { token: c })).body;
    expect(list.find((x: { document_key: string }) => x.document_key === 'ticari-ileti-izni').withdrawn_at).not.toBeNull();
    expect((await t.call('POST', '/me/consents/kullanici-sozlesmesi/withdraw', { token: c })).body.error).toBe('NOT_WITHDRAWABLE');
  });

  it('lists the documents and their versions publicly', async () => {
    const docs = (await t.call('GET', '/public/legal')).body;
    expect(docs.map((d: { key: string }) => d.key)).toContain('kvkk-aydinlatma');
  });
});

describe('co-owner (Ortak) (v1.6)', () => {
  it('has the same permissions as the owner', async () => {
    const shop = await setupShop(t);
    const added = await t.call('POST', `${shop.base}/members`, {
      token: shop.tokens.owner,
      body: { phone: '+905320000055', displayName: 'Ortak Bey', role: 'co_owner', bookable: false },
    });
    expect(added.status).toBe(201);
    const coOwner = await t.login('+905320000055', { portal: 'business' });
    expect((await t.call('GET', '/me', { token: coOwner })).body.portal).toBe('owner');
    const price = await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, { token: coOwner, body: { priceKurus: 55000 } });
    expect(price.status).toBe(204);
  });
});

describe('test deployments (DEMO_MODE)', () => {
  it('shows the sign-in code and approves registrations straight away; off by default', async () => {
    const request = () => t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer } });
    expect((await request()).status).toBe(204);

    t.deps.config.demoMode = true;
    try {
      t.clock.advance(2);
      const res = await request();
      expect(res.body.demoCode).toMatch(/^\d{6}$/);
      const verified = await t.call('POST', '/auth/otp/verify', {
        body: { phone: PHONES.customer, code: res.body.demoCode, firstName: 'A', lastName: 'B' },
      });
      expect(verified.status).toBe(200);

      const r = await t.call('POST', '/registrations', { token: verified.body.token, body: registration() });
      expect((await t.call('GET', `/public/shops/${r.body.slug}`)).status).toBe(200);
    } finally {
      t.deps.config.demoMode = false;
    }
  });

  it('can keep photos in the database', async () => {
    const store = databaseStorage(t.db);
    await store.put('shop/a.webp', Buffer.from('photo'));
    expect((await store.get('shop/a.webp'))?.toString()).toBe('photo');
    await store.delete('shop/a.webp');
    expect(await store.get('shop/a.webp')).toBeNull();
  });
});
