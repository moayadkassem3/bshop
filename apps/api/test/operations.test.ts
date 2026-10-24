import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const customer = () => t.login(PHONES.customer, { names: { firstName: 'Ahmet', lastName: 'Yılmaz' } });
const userId = async (phone: string) =>
  (await t.db.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [phone])).rows[0]!.id;
const appointment = async (id: string) => (await t.db.query('SELECT * FROM appointments WHERE id = $1', [id])).rows[0];

describe('shops are kept apart (one system, many paying shops)', () => {
  it("a member of one shop cannot read or act on another shop's data", async () => {
    const a = await setupShop(t);
    const b = await setupShop(t, { slug: 'other-shop', ownerPhone: '+905320000099' });
    const r = await book(t, a, await customer(), { serviceIds: [a.services.haircut], staffId: a.staff.cumali, startsAt: at('16:00') });
    const apptId = r.body.appointments[0].id;
    const ownerB = b.tokens.owner;

    const list = await t.call('GET', `${a.base}/appointments?from=${at('00:00')}&to=${at('23:59')}`, { token: ownerB });
    expect(list.status).toBe(403);
    // Using shop B's path with shop A's appointment id finds nothing.
    const confirm = await t.call('POST', `${b.base}/appointments/${apptId}/confirm`, { token: ownerB });
    expect(confirm.status).toBe(404);
    // A service from shop A cannot be attached to a staff member of shop B.
    const attach = await t.call('PUT', `${b.base}/members/${b.staff.cumali}/services`, {
      token: ownerB,
      body: [{ serviceId: a.services.haircut }],
    });
    expect(attach.status).toBe(400);
  });

  it('staff manage only their own appointments; owners manage all', async () => {
    const shop = await setupShop(t);
    const r = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const id = r.body.appointments[0].id;
    const tahir = await t.login(PHONES.tahir, { portal: 'staff' });
    expect((await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: tahir })).status).toBe(403);
    const tahirView = await t.call('GET', `${shop.base}/appointments?from=${at('00:00')}&to=${at('23:59')}`, { token: tahir });
    expect(tahirView.body).toHaveLength(0);
    expect((await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: shop.tokens.owner })).body.status).toBe(
      'confirmed',
    );
  });

  it('a removed staff member loses access immediately', async () => {
    const shop = await setupShop(t);
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    await t.call('PATCH', `${shop.base}/members/${shop.staff.cumali}`, { token: shop.tokens.owner, body: { active: false } });
    const r = await t.call('GET', `${shop.base}/appointments?from=${at('00:00')}&to=${at('23:59')}`, { token: cumali });
    expect(r.status).toBe(403);
  });
});

describe('subscription and review control visibility (scenario 11)', () => {
  it('only reviewed, subscribed shops have a public profile, appear in search, and take bookings', async () => {
    const shop = await setupShop(t);
    expect((await t.call('GET', '/public/search?q=nirvana')).body.map((s: { slug: string }) => s.slug)).toEqual([shop.slug]);

    await t.call('PUT', `/admin/shops/${shop.shopId}/subscription`, { token: shop.tokens.admin, body: { status: 'canceled' } });
    expect((await t.call('GET', '/public/search?q=nirvana')).body).toEqual([]);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
    const r = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: null, startsAt: at('16:00') });
    expect(r.status).toBe(404);
  });

  it('a failed payment keeps the shop visible during the grace period only', async () => {
    const shop = await setupShop(t);
    await t.call('PUT', `/admin/shops/${shop.shopId}/subscription`, {
      token: shop.tokens.admin,
      body: { status: 'past_due', graceUntil: '2026-11-02T06:00:00.000Z' },
    });
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(200);
    t.clock.set('2026-11-02T06:00:00.000Z');
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).status).toBe(404);
  });

  it('shop links cannot take the names of website pages', async () => {
    const shop = await setupShop(t);
    const r = await t.call('POST', '/admin/shops', {
      token: shop.tokens.admin,
      body: {
        name: 'Harita',
        slug: 'harita',
        owner: { phone: '+905320000077', firstName: 'A', lastName: 'B', displayName: 'A B' },
      },
    });
    expect(r.status).toBe(400);
  });

  it('home-page search finds only bookable shops', async () => {
    const shop = await setupShop(t);
    expect((await t.call('GET', '/public/search?q=nirvana')).body.map((s: { slug: string }) => s.slug)).toEqual([shop.slug]);
    await t.call('PUT', `/admin/shops/${shop.shopId}/subscription`, { token: shop.tokens.admin, body: { status: 'none' } });
    expect((await t.call('GET', '/public/search?q=nirvana')).body).toEqual([]);
  });

  it('only platform admins can create or review shops', async () => {
    const shop = await setupShop(t);
    const r = await t.call('POST', `/admin/shops/${shop.shopId}/review`, { token: shop.tokens.owner });
    expect(r.status).toBe(403);
  });
});

describe('daily operations (scenario 12)', () => {
  it('walk-ins and blocked time remove those times from online booking', async () => {
    const shop = await setupShop(t);
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    t.clock.set(at('12:00'));
    const walkIn = await t.call('POST', `${shop.base}/appointments`, {
      token: cumali,
      body: { staffId: shop.staff.cumali, serviceIds: [shop.services.haircut], customerName: 'Kapıdan gelen', walkIn: true },
    });
    expect(walkIn.status).toBe(201);
    const block = await t.call('POST', `${shop.base}/blocks`, {
      token: cumali,
      body: { staffId: shop.staff.cumali, startsAt: at('14:00'), endsAt: at('15:00'), note: 'Öğle arası' },
    });
    expect(block.status).toBe(201);

    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    const starts = slots.body.slots.map((s: { startsAt: string }) => s.startsAt);
    expect(starts[0]).toBe(at('12:30'));
    expect(starts).not.toContain(at('13:45'));
    expect(starts).not.toContain(at('14:00'));
    expect(starts).toContain(at('15:00'));

    // A block cannot cover an existing appointment; that needs the absence flow.
    const clash = await t.call('POST', `${shop.base}/blocks`, {
      token: cumali,
      body: { staffId: shop.staff.cumali, startsAt: at('12:00'), endsAt: at('12:15') },
    });
    expect(clash.body.error).toBe('OVERLAPS_APPOINTMENTS');
  });

  it('a phone booking entered by staff links to the customer account', async () => {
    const shop = await setupShop(t);
    const r = await t.call('POST', `${shop.base}/appointments`, {
      token: shop.tokens.owner,
      body: {
        staffId: shop.staff.cumali,
        serviceIds: [shop.services.haircut],
        startsAt: at('18:00'),
        customerName: 'Ahmet Yılmaz',
        customerPhone: '0555 000 00 01',
      },
    });
    const a = await appointment(r.body.id);
    expect(a.status).toBe('confirmed');
    expect(a.confirmed_via).toBe('staff_entry');
    await customer();
    expect(a.customer_id).toBe(await userId(PHONES.customer));
  });
});

describe('shop service list (scenario 13)', () => {
  it('starts from the 45-service template; shops add and rename services', async () => {
    const shop = await setupShop(t);
    const catalog = await t.call('GET', '/catalog', { token: shop.tokens.owner });
    expect(catalog.body).toHaveLength(45);
    expect(catalog.body.find((s: { name: string }) => s.name === 'Çocuk Tıraşı').duration_minutes).toBe(30);

    const custom = await t.call('POST', `${shop.base}/services`, {
      token: shop.tokens.owner,
      body: { name: 'VIP Paket', durationMinutes: 90, priceKurus: 150000, priceIsStartingFrom: true },
    });
    expect(custom.status).toBe(201);
    await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, {
      token: shop.tokens.owner,
      body: { name: 'Erkek Saç Kesimi' },
    });
    const profile = await t.call('GET', `/public/shops/${shop.slug}`);
    const names = profile.body.services.map((s: { name: string }) => s.name);
    expect(names).toContain('Erkek Saç Kesimi');
    expect(names).toContain('VIP Paket');
    expect(profile.body.services.find((s: { name: string }) => s.name === 'VIP Paket').price_is_starting_from).toBe(true);
  });

  it('only the owner sets prices; staff set their own services and durations', async () => {
    const shop = await setupShop(t);
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    const price = await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, {
      token: cumali,
      body: { priceKurus: 1 },
    });
    expect(price.status).toBe(403);
    const own = await t.call('PUT', `${shop.base}/members/${shop.staff.cumali}/services`, {
      token: cumali,
      body: [{ serviceId: shop.services.haircut, durationMinutes: 25 }],
    });
    expect(own.status).toBe(204);
    const other = await t.call('PUT', `${shop.base}/members/${shop.staff.tahir}/services`, {
      token: cumali,
      body: [{ serviceId: shop.services.haircut }],
    });
    expect(other.status).toBe(403);
  });

  it('renaming a service does not change past appointments', async () => {
    const shop = await setupShop(t);
    const r = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, { token: shop.tokens.owner, body: { name: 'Yeni Ad' } });
    const snap = await t.db.query('SELECT name FROM appointment_services WHERE appointment_id = $1', [r.body.appointments[0].id]);
    expect(snap.rows[0].name).toBe('Saç Kesimi');
  });
});

describe('unexpected staff absence (handoff 4.8)', () => {
  it('suggests replacements, reassigns or cancels, and texts customers', async () => {
    const shop = await setupShop(t);
    const c1 = await customer();
    const c2 = await t.login(PHONES.customer2, { names: { firstName: 'Mehmet', lastName: 'Kaya' } });
    // c1 chose Cumali; c2 chose "Fark etmez" and was given Cumali (Salih is busy then, Tahir cannot do beards).
    const r1 = await book(t, shop, c1, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('15:00') });
    await t.call('POST', `${shop.base}/appointments`, {
      token: shop.tokens.owner,
      body: { staffId: shop.staff.salih, serviceIds: [shop.services.beard], startsAt: at('17:00'), customerName: 'X' },
    });
    const r2 = await book(t, shop, c2, { serviceIds: [shop.services.beard], staffId: null, startsAt: at('17:00') });
    expect(r2.body.appointments[0].staffId).toBe(shop.staff.cumali);

    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    const mark = await t.call('POST', `${shop.base}/absences`, {
      token: cumali,
      body: { staffId: shop.staff.cumali, startsAt: at('12:00'), endsAt: at('21:00') },
    });
    expect(mark.status).toBe(201);
    const affected = mark.body.affected;
    expect(affected).toHaveLength(2);
    const first = affected.find((a: { appointmentId: string }) => a.appointmentId === r1.body.appointments[0].id);
    const second = affected.find((a: { appointmentId: string }) => a.appointmentId === r2.body.appointments[0].id);
    expect(first.requestedStaff).toBe(true);
    expect(first.suggestedStaffId).not.toBeNull();
    expect(second.suggestedStaffId).toBeNull(); // nobody else free for a beard at 17:00

    // New bookings for Cumali stop at once.
    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    expect(slots.body.slots.every((s: { startsAt: string }) => s.startsAt < at('12:00'))).toBe(true);

    // The owner was alerted, because staff marked their own absence.
    await t.tick();
    expect(t.push.to(await userId(PHONES.owner)).some((m) => m.title.includes('yok olarak işaretlendi'))).toBe(true);

    // Staff cannot apply; the owner applies.
    const decisions = [
      { appointmentId: first.appointmentId, action: 'reassign', staffId: first.suggestedStaffId },
      { appointmentId: second.appointmentId, action: 'cancel' },
    ];
    const url = `${shop.base}/absences/${mark.body.absenceId}/apply`;
    expect((await t.call('POST', url, { token: cumali, body: { decisions } })).status).toBe(403);
    const applied = await t.call('POST', url, { token: shop.tokens.owner, body: { decisions } });
    expect(applied.body.map((x: { outcome: string }) => x.outcome)).toEqual(['reassigned', 'cancelled']);

    const moved = await appointment(first.appointmentId);
    expect(moved.staff_id).toBe(first.suggestedStaffId);
    expect(moved.status).toBe('pending');
    const cancelled = await appointment(second.appointmentId);
    expect(cancelled.cancel_reason).toBe('staff_absence');

    await t.tick();
    expect(t.sms.to(PHONES.customer).at(-1)).toContain('Cumali Esen bu saatte müsait değil');
    expect(t.sms.to(PHONES.customer2).at(-1)).toContain('iptal edildi');
    // Shop-caused changes are not held against the customer.
    const standing = await t.db.query('SELECT late_cancel_count, no_show_count FROM shop_customers WHERE user_id = $1', [
      await userId(PHONES.customer2),
    ]);
    expect(standing.rows[0]).toEqual({ late_cancel_count: 0, no_show_count: 0 });
  });
});

describe('SMS codes', () => {
  it('limits resends and wrong attempts', async () => {
    expect((await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer } })).status).toBe(204);
    expect((await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer } })).body.error).toBe('OTP_TOO_SOON');
    await t.tick();
    const code = t.sms.to(PHONES.customer)[0]!.match(/(\d{6})/)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await t.call('POST', '/auth/otp/verify', { body: { phone: PHONES.customer, code: wrong } });
      expect(r.body.error).toBe('OTP_INVALID');
    }
    // After 5 wrong attempts even the right code is refused.
    const right = await t.call('POST', '/auth/otp/verify', { body: { phone: PHONES.customer, code } });
    expect(right.body.error).toBe('OTP_INVALID');
  });

  it('codes expire after 5 minutes', async () => {
    await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer } });
    await t.tick();
    const code = t.sms.to(PHONES.customer)[0]!.match(/(\d{6})/)![1]!;
    t.clock.advance(6);
    const r = await t.call('POST', '/auth/otp/verify', { body: { phone: PHONES.customer, code } });
    expect(r.body.error).toBe('OTP_INVALID');
  });
});

describe('separate sign-in for owners and staff', () => {
  it('each entrance only accepts its own people, before any SMS is sent', async () => {
    await setupShop(t);
    t.sms.messages = [];
    const staffAsOwner = await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.cumali, portal: 'owner' } });
    expect(staffAsOwner.body.error).toBe('NOT_OWNER');
    const ownerAsStaff = await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.owner, portal: 'staff' } });
    expect(ownerAsStaff.body.error).toBe('NOT_STAFF');
    const stranger = await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.customer, portal: 'staff' } });
    expect(stranger.body.error).toBe('NOT_STAFF');
    await t.tick();
    expect(t.sms.messages).toHaveLength(0);
  });

  it('a code requested for one entrance cannot open another', async () => {
    await setupShop(t);
    t.clock.advance(5);
    await t.call('POST', '/auth/otp/request', { body: { phone: PHONES.cumali, portal: 'staff' } });
    await t.tick();
    const code = t.sms.to(PHONES.cumali).at(-1)!.match(/(\d{6})/)![1];
    const asOwner = await t.call('POST', '/auth/otp/verify', { body: { phone: PHONES.cumali, code, portal: 'owner' } });
    expect(asOwner.body.error).toBe('NOT_OWNER');
  });

  it('website sessions cannot reach shop data, even for staff phones', async () => {
    const shop = await setupShop(t);
    const web = await t.login(PHONES.cumali);
    const r = await t.call('GET', `${shop.base}/appointments?from=${at('00:00')}&to=${at('23:59')}`, { token: web });
    expect(r.status).toBe(403);
    expect((await t.call('GET', '/staff/shops', { token: web })).status).toBe(403);
  });

  it('owner powers need owner sign-in', async () => {
    const shop = await setupShop(t);
    // Salih owns this shop and is also staff at another one, so he can use both entrances.
    const other = await setupShop(t, { slug: 'other-shop', ownerPhone: '+905320000099' });
    await t.call('POST', `${other.base}/members`, { token: other.tokens.owner, body: { phone: PHONES.owner, displayName: 'Salih' } });

    const asStaff = await t.login(PHONES.owner, { portal: 'staff' });
    const shops = await t.call('GET', '/staff/shops', { token: asStaff });
    expect(shops.body.every((s: { role: string }) => s.role === 'staff')).toBe(true);
    const price = await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, {
      token: asStaff,
      body: { priceKurus: 1 },
    });
    expect(price.status).toBe(403);

    const ok = await t.call('PATCH', `${shop.base}/services/${shop.services.haircut}`, {
      token: shop.tokens.owner,
      body: { priceKurus: 50000 },
    });
    expect(ok.status).toBe(204);
  });
});

describe('shop profile page (handoff v1.3)', () => {
  const jpeg = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#7a5c3e' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'camera owner' } })
      .toBuffer();

  it('shows contact details, opening hours, and photos; uploads are re-encoded without metadata', async () => {
    const shop = await setupShop(t);
    await t.call('PATCH', `${shop.base}/settings`, {
      token: shop.tokens.owner,
      body: {
        district: 'Kadıköy',
        phone: '0532 000 00 00',
        whatsapp: '0532 000 00 01',
        instagram: 'https://www.instagram.com/nirvanaformen/',
        about: 'Moda’nın klasik berberi.',
      },
    });
    const upload = await t.call('POST', `${shop.base}/photos`, {
      token: shop.tokens.owner,
      body: await jpeg(3000, 2000),
      contentType: 'image/jpeg',
    });
    expect(upload.status).toBe(201);
    expect([upload.body.width, upload.body.height]).toEqual([1600, 1067]);

    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    expect(profile).toMatchObject({ district: 'Kadıköy', whatsapp: '+905320000001', instagram: 'nirvanaformen' });
    expect(profile.photos).toHaveLength(1);
    expect(profile.openingHours[0]).toEqual({ weekday: 1, open: '10:00', close: '21:00' });

    const image = await t.call('GET', `/public/photos/${profile.photos[0].id}`);
    const meta = await sharp(image.raw).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('only owners manage photos; order and limit are enforced', async () => {
    const shop = await setupShop(t);
    const staff = await t.login(PHONES.cumali, { portal: 'staff' });
    const denied = await t.call('POST', `${shop.base}/photos`, { token: staff, body: await jpeg(100, 100), contentType: 'image/jpeg' });
    expect(denied.status).toBe(403);
    const bad = await t.call('POST', `${shop.base}/photos`, {
      token: shop.tokens.owner,
      body: Buffer.from('not an image'),
      contentType: 'image/png',
    });
    expect(bad.body.error).toBe('INVALID_IMAGE');

    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await t.call('POST', `${shop.base}/photos`, { token: shop.tokens.owner, body: await jpeg(200, 200), contentType: 'image/jpeg' });
      ids.push(r.body.id);
    }
    const thirteenth = await t.call('POST', `${shop.base}/photos`, { token: shop.tokens.owner, body: await jpeg(200, 200), contentType: 'image/jpeg' });
    expect(thirteenth.body.error).toBe('PHOTO_LIMIT');

    const reversed = [...ids].reverse();
    expect((await t.call('PUT', `${shop.base}/photos/order`, { token: shop.tokens.owner, body: reversed })).status).toBe(204);
    expect((await t.call('DELETE', `${shop.base}/photos/${reversed[0]}`, { token: shop.tokens.owner })).status).toBe(204);
    const profile = (await t.call('GET', `/public/shops/${shop.slug}`)).body;
    expect(profile.photos.map((p: { id: string }) => p.id)).toEqual(reversed.slice(1));
    expect((await t.call('GET', `/public/photos/${reversed[0]}`)).status).toBe(404);
  });

  it('rejects an invalid Instagram handle', async () => {
    const shop = await setupShop(t);
    const r = await t.call('PATCH', `${shop.base}/settings`, { token: shop.tokens.owner, body: { instagram: 'not a handle!' } });
    expect(r.body.error).toBe('INVALID_INSTAGRAM');
  });
});
