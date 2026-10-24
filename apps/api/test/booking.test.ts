import { describe, expect, it } from 'vitest';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const customer = () => t.login(PHONES.customer, { firstName: 'Ahmet', lastName: 'Yılmaz' });

async function userId(phone: string) {
  return (await t.db.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [phone])).rows[0]!.id;
}
async function appointment(id: string) {
  return (await t.db.query('SELECT * FROM appointments WHERE id = $1', [id])).rows[0];
}

describe('acceptance scenarios (handoff Section 9)', () => {
  it('1. a customer books from the shop link on the web, without an app', async () => {
    const shop = await setupShop(t);
    const profile = await t.call('GET', `/public/shops/${shop.slug}`);
    expect(profile.status).toBe(200);
    expect(profile.body.services.map((s: { name: string }) => s.name)).toContain('Saç Kesimi');

    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    expect(slots.body.slots[0].startsAt).toBe(at('10:00'));
    expect(slots.body.totalPriceKurus).toBe(45000);

    const res = await book(t, shop, await customer(), {
      serviceIds: [shop.services.haircut],
      staffId: shop.staff.cumali,
      startsAt: at('16:00'),
    });
    expect(res.status).toBe(201);
    expect(res.body.appointments[0].status).toBe('pending');
  });

  it('2 + 3. staff have separate schedules; a pending request holds the time for that staff member only', async () => {
    const shop = await setupShop(t);
    await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });

    const other = await t.login(PHONES.customer2, { firstName: 'Mehmet', lastName: 'Kaya' });
    const overlap = await book(t, shop, other, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:15') });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toBe('SLOT_TAKEN');

    const otherStaff = await book(t, shop, other, { serviceIds: [shop.services.haircut], staffId: shop.staff.salih, startsAt: at('16:15') });
    expect(otherStaff.status).toBe(201);

    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    const starts = slots.body.slots.map((s: { startsAt: string }) => s.startsAt);
    expect(starts).not.toContain(at('16:00'));
    expect(starts).not.toContain(at('15:45'));
    expect(starts).toContain(at('16:30'));
  });

  it('3. two customers tapping the same time at once: exactly one gets it', async () => {
    const shop = await setupShop(t);
    const [a, b] = [await customer(), await t.login(PHONES.customer2, { firstName: 'Mehmet', lastName: 'Kaya' })];
    const item = { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('17:00') };
    const results = await Promise.all([book(t, shop, a, item), book(t, shop, b, item)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('4. unanswered request: reminder at 10 minutes to staff and owner, confirmed at 15, customer gets an SMS', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('14:00'));
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const id = res.body.appointments[0].id;
    expect(res.body.appointments[0].deadlineAt).toBe(at('14:15'));
    await t.tick();
    const cumaliUser = await userId(PHONES.cumali);
    const ownerUser = await userId(PHONES.owner);
    expect(t.push.to(cumaliUser).map((m) => m.title)).toEqual(['Yeni randevu talebi']);

    t.clock.set(at('14:09'));
    await t.tick();
    expect(t.push.to(cumaliUser)).toHaveLength(1);

    t.clock.set(at('14:10'));
    await t.tick();
    expect(t.push.to(cumaliUser).at(-1)!.title).toBe('Hatırlatma: talep yanıt bekliyor');
    expect(t.push.to(ownerUser).at(-1)!.title).toBe('Hatırlatma: talep yanıt bekliyor');
    expect((await appointment(id)).status).toBe('pending');

    t.clock.set(at('14:15'));
    await t.tick();
    const a = await appointment(id);
    expect(a.status).toBe('confirmed');
    expect(a.confirmed_via).toBe('timeout');
    expect(t.sms.to(PHONES.customer).at(-1)).toContain('randevunuz onaylandı');
    expect(t.push.to(cumaliUser).at(-1)!.title).toBe('Randevu otomatik onaylandı');
  });

  it('4. last-minute request confirms at its start time', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('14:00'));
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('14:05') });
    expect(res.status).toBe(201);
    const id = res.body.appointments[0].id;
    expect((await appointment(id)).reminder_at).toBeNull();
    t.clock.set(at('14:04'));
    await t.tick();
    expect((await appointment(id)).status).toBe('pending');
    t.clock.set(at('14:05'));
    await t.tick();
    expect((await appointment(id)).status).toBe('confirmed');
  });

  it('5. staff decline before the deadline releases the slot; one outcome only', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('14:00'));
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const id = res.body.appointments[0].id;
    const cumali = await t.login(PHONES.cumali);

    t.clock.set(at('14:05'));
    const declined = await t.call('POST', `${shop.base}/appointments/${id}/decline`, { token: cumali });
    expect(declined.body.status).toBe('declined');
    await t.tick();
    expect(t.sms.to(PHONES.customer).at(-1)).toContain('kabul edilemedi');

    // The timer later finds nothing to do, and the slot is free again.
    t.clock.set(at('14:15'));
    expect((await t.tick()).confirmed).toBe(0);
    expect((await appointment(id)).status).toBe('declined');
    const again = await book(t, shop, await t.login(PHONES.customer2, { firstName: 'M', lastName: 'K' }), {
      serviceIds: [shop.services.haircut],
      staffId: shop.staff.cumali,
      startsAt: at('16:00'),
    });
    expect(again.status).toBe(201);
  });

  it('5. staff confirm is idempotent and wins over the timer', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('14:00'));
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const id = res.body.appointments[0].id;
    const cumali = await t.login(PHONES.cumali);
    const first = await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
    const second = await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
    expect(first.body).toEqual({ status: 'confirmed', confirmedVia: 'staff' });
    expect(second.body.status).toBe('confirmed');
    t.clock.set(at('14:15'));
    expect((await t.tick()).confirmed).toBe(0);
    await t.tick();
    expect(t.sms.to(PHONES.customer).filter((m) => m.includes('onaylandı'))).toHaveLength(1);
  });

  it('5. a decline after the deadline is a cancellation, even before the timer runs', async () => {
    const shop = await setupShop(t);
    t.clock.set(at('14:00'));
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const id = res.body.appointments[0].id;
    t.clock.set(at('14:16'));
    const r = await t.call('POST', `${shop.base}/appointments/${id}/decline`, { token: await t.login(PHONES.cumali) });
    expect(r.body.status).toBe('cancelled');
    expect((await appointment(id)).cancel_reason).toBe('shop');
  });

  it('7. automatic-confirmation hours confirm at once and still send the special alert', async () => {
    const shop = await setupShop(t);
    await t.call('PUT', `${shop.base}/auto-confirm-hours`, {
      token: shop.tokens.owner,
      body: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
    });
    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    const at1100 = slots.body.slots.find((s: { startsAt: string }) => s.startsAt === at('11:00'));
    const at1300 = slots.body.slots.find((s: { startsAt: string }) => s.startsAt === at('13:00'));
    expect(at1100.instantConfirmation).toBe(true);
    expect(at1300.instantConfirmation).toBe(false);

    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('11:00') });
    expect(res.body.appointments[0].status).toBe('confirmed');
    await t.tick();
    expect(t.push.to(await userId(PHONES.cumali)).map((m) => m.title)).toEqual(['Yeni randevu (onaylandı)']);
    expect(t.sms.to(PHONES.customer).at(-1)).toContain('onaylandı');
  });

  it('8. "Fark etmez" assigns an eligible, free staff member with the lightest load', async () => {
    const shop = await setupShop(t);
    // Salih already has a booking today; Tahir cannot do beards; Cumali is free and eligible.
    await book(t, shop, await t.login(PHONES.customer2, { firstName: 'M', lastName: 'K' }), {
      serviceIds: [shop.services.haircut],
      staffId: shop.staff.salih,
      startsAt: at('12:00'),
    });
    const res = await book(t, shop, await customer(), { serviceIds: [shop.services.combo], staffId: null, startsAt: at('16:00') });
    expect(res.status).toBe(201);
    expect(res.body.appointments[0].staffId).toBe(shop.staff.cumali);
    const a = await appointment(res.body.appointments[0].id);
    expect(a.requested_staff).toBe(false);

    const slots = await t.call('GET', `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.beard}`);
    const staffAt10 = slots.body.slots[0].staff.map((s: { id: string }) => s.id);
    expect(staffAt10).not.toContain(shop.staff.tahir);
  });

  it('9. several services add up; a combined service uses its own duration; staff durations apply', async () => {
    const shop = await setupShop(t);
    const c = await customer();
    const two = await book(t, shop, c, {
      serviceIds: [shop.services.haircut, shop.services.beard],
      staffId: shop.staff.cumali,
      startsAt: at('12:00'),
    });
    const a = await appointment(two.body.appointments[0].id);
    expect((a.ends_at.getTime() - a.starts_at.getTime()) / 60_000).toBe(50);
    expect(a.total_price_kurus).toBe(75000);

    // Cumali sets his own 40-minute combo; the catalog default is 60.
    const cumali = await t.login(PHONES.cumali);
    await t.call('PUT', `${shop.base}/members/${shop.staff.cumali}/services`, {
      token: cumali,
      body: [{ serviceId: shop.services.haircut }, { serviceId: shop.services.beard }, { serviceId: shop.services.combo, durationMinutes: 40 }],
    });
    await t.call('POST', `${shop.base}/appointments/${a.id}/confirm`, { token: cumali });
    t.clock.advance(1);
    const combo = await book(t, shop, c, { serviceIds: [shop.services.combo], staffId: shop.staff.cumali, startsAt: at('15:00') });
    const b = await appointment(combo.body.appointments[0].id);
    expect((b.ends_at.getTime() - b.starts_at.getTime()) / 60_000).toBe(40);
    // The earlier appointment keeps its booked duration.
    expect(((await appointment(a.id)).ends_at.getTime() - a.starts_at.getTime()) / 60_000).toBe(50);
  });

  it('10. the shop profile shows the cancellation rule, prices, and payment at the shop', async () => {
    const shop = await setupShop(t);
    await t.call('PATCH', `${shop.base}/settings`, { token: shop.tokens.owner, body: { cancellationCutoffMinutes: 180 } });
    const p = await t.call('GET', `/public/shops/${shop.slug}`);
    expect(p.body.cancellationCutoffMinutes).toBe(180);
    expect(p.body.paymentAtShop).toBe(true);
    expect(p.body.services.find((s: { name: string }) => s.name === 'Saç Kesimi').price_kurus).toBe(45000);
  });

  it('14. booking for someone else, and for two people at once', async () => {
    const shop = await setupShop(t);
    const res = await t.call('POST', `/shops/${shop.slug}/bookings`, {
      token: await customer(),
      body: {
        items: [
          { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') },
          { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:30'), guestName: 'Emir' },
        ],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.appointments).toHaveLength(2);
    await t.tick();
    const alerts = t.push.to(await userId(PHONES.cumali)).map((m) => m.body);
    expect(alerts.some((b) => b.startsWith('Emir (Ahmet Yılmaz adına)'))).toBe(true);

    const list = await t.call('GET', `${shop.base}/appointments?from=${at('00:00')}&to=${at('23:59')}`, {
      token: await t.login(PHONES.cumali),
    });
    expect(list.body.map((a: { guest_name: string | null }) => a.guest_name)).toEqual([null, 'Emir']);
  });

  it('15. owner and staff both see the customer phone number', async () => {
    const shop = await setupShop(t);
    await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const range = `from=${at('00:00')}&to=${at('23:59')}`;
    const staffView = await t.call('GET', `${shop.base}/appointments?${range}`, { token: await t.login(PHONES.cumali) });
    const ownerView = await t.call('GET', `${shop.base}/appointments?${range}`, { token: shop.tokens.owner });
    expect(staffView.body[0].customer_phone).toBe(PHONES.customer);
    expect(ownerView.body[0].customer_phone).toBe(PHONES.customer);
  });
});

describe('protections without deposits (handoff 2.1)', () => {
  it('one pending request per customer per shop', async () => {
    const shop = await setupShop(t);
    const c = await customer();
    await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    const second = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.salih, startsAt: at('17:00') });
    expect(second.body.error).toBe('PENDING_EXISTS');
  });

  it('at most 2 upcoming bookings per customer per shop by default', async () => {
    const shop = await setupShop(t);
    const c = await customer();
    const cumali = await t.login(PHONES.cumali);
    for (const time of ['12:00', '13:00']) {
      const r = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at(time) });
      await t.call('POST', `${shop.base}/appointments/${r.body.appointments[0].id}/confirm`, { token: cumali });
    }
    const third = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('14:00') });
    expect(third.body.error).toBe('BOOKING_LIMIT');
  });

  it('a blocked customer cannot book', async () => {
    const shop = await setupShop(t);
    const c = await customer();
    await t.call('POST', `${shop.base}/customers/${await userId(PHONES.customer)}/block`, {
      token: shop.tokens.owner,
      body: { blocked: true },
    });
    const r = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('16:00') });
    expect(r.status).toBe(403);
  });

  it('late cancellation is allowed and recorded; no-shows are counted', async () => {
    const shop = await setupShop(t);
    const c = await customer();
    const cumali = await t.login(PHONES.cumali);
    const r = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('10:30') });
    const id = r.body.appointments[0].id;
    await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
    const cancel = await t.call('POST', `/me/appointments/${id}/cancel`, { token: c });
    expect(cancel.body).toEqual({ status: 'cancelled', late: true });

    const r2 = await book(t, shop, c, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('11:00') });
    const id2 = r2.body.appointments[0].id;
    await t.call('POST', `${shop.base}/appointments/${id2}/confirm`, { token: cumali });
    t.clock.set(at('11:20'));
    expect((await t.call('POST', `${shop.base}/appointments/${id2}/no-show`, { token: cumali })).body.status).toBe('no_show');

    const standing = (await t.db.query('SELECT * FROM shop_customers WHERE user_id = $1', [await userId(PHONES.customer)])).rows[0];
    expect(standing.late_cancel_count).toBe(1);
    expect(standing.no_show_count).toBe(1);
  });

  it('booking requires a verified phone (an SMS code), and a name', async () => {
    const shop = await setupShop(t);
    const anon = await book(t, shop, 'not-a-token', { serviceIds: [shop.services.haircut], staffId: null, startsAt: at('16:00') });
    expect(anon.status).toBe(401);
    const noName = await t.login(PHONES.customer2);
    const r = await book(t, shop, noName, { serviceIds: [shop.services.haircut], staffId: null, startsAt: at('16:00') });
    expect(r.body.error).toBe('NAME_REQUIRED');
  });

  it('times before now + lead time are refused', async () => {
    const shop = await setupShop(t);
    await t.call('PATCH', `${shop.base}/settings`, { token: shop.tokens.owner, body: { minLeadMinutes: 60 } });
    t.clock.set(at('14:01'));
    const r = await book(t, shop, await customer(), { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('14:30') });
    expect(r.body.error).toBe('SLOT_TAKEN');
    const slots = await t.call(
      'GET',
      `/public/shops/${shop.slug}/availability?date=2026-10-26&serviceIds=${shop.services.haircut}&staffId=${shop.staff.cumali}`,
    );
    expect(slots.body.slots[0].startsAt).toBe(at('15:05'));
  });
});
