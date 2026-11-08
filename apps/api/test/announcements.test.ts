import { describe, expect, it } from 'vitest';
import { nextRepeat } from '../src/services/announcements.js';
import { PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const userIdOf = async (phone: string) => (await t.db.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0].id as string;

/** A salon (owner, Cumali and Tahir work there) and two customers, all with the app except Tahir. */
async function people() {
  const shop = await setupShop(t);
  const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
  const ayse = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
  const mehmet = await t.login(PHONES.customer2, { names: { firstName: 'Mehmet', lastName: 'Demir' } });
  await t.db.query("UPDATE users SET gender = 'female' WHERE phone = $1", [PHONES.customer]);
  await t.db.query("UPDATE users SET gender = 'male' WHERE phone = $1", [PHONES.customer2]);
  for (const [token, phone] of [
    [shop.tokens.owner, 'owner'],
    [cumali, 'cumali'],
    [ayse, 'ayse'],
    [mehmet, 'mehmet'],
  ] as const) {
    await t.call('POST', '/me/push-device', { token, body: { token: `fcm-token-${phone}-0123456789`, platform: 'android' } });
  }
  return { shop, admin: shop.tokens.admin, cumali, ayse, mehmet };
}

const receivers = () => t.push.messages.filter((m) => m.data?.kind === 'announcement').map((m) => m.userId);

describe('announcements from Yönetim (founder, 8 November 2026)', () => {
  it('only the platform team writes them', async () => {
    const p = await people();
    const body = { title: 'Merhaba', body: 'Deneme', audience: 'all', repeat: 'once' };
    expect((await t.call('POST', '/admin/announcements', { token: p.shop.tokens.owner, body })).status).toBe(403);
    expect((await t.call('GET', '/admin/announcements', { token: p.ayse })).status).toBe(403);
  });

  it('goes to salons now, as a push; customers do not get it', async () => {
    const p = await people();
    const count = await t.call('GET', '/admin/announcements/recipients?audience=businesses', { token: p.admin });
    expect(count.body).toEqual({ recipients: 2 });

    const created = await t.call('POST', '/admin/announcements', {
      token: p.admin,
      body: { title: 'Bugün anlık çağrıları kaçırma', body: 'Pazar tıraşı için berber arayan müşteriler sana ulaşabilsin.', audience: 'businesses', repeat: 'once' },
    });
    expect(created.status).toBe(201);
    await t.tick();
    expect(receivers().sort()).toEqual([await userIdOf(PHONES.owner), await userIdOf(PHONES.cumali)].sort());
    const msg = t.push.messages.find((m) => m.data?.kind === 'announcement')!;
    expect(msg).toMatchObject({ title: 'Bugün anlık çağrıları kaçırma', data: { kind: 'announcement', announcementId: created.body.id } });

    // Sent once: not again on the next pass, and it is shown as sent.
    await t.tick();
    expect(receivers()).toHaveLength(2);
    const [row] = (await t.call('GET', '/admin/announcements', { token: p.admin })).body;
    expect(row).toMatchObject({ active: false, last_sent_count: 2, total_sent: 2 });

    // Not mixed into the person's appointment notifications.
    expect((await t.call('GET', '/me/notifications', { token: p.cumali })).body).toEqual([]);
  });

  it('customers can be chosen by gender, and anyone can turn announcements off', async () => {
    const p = await people();
    expect((await t.call('GET', '/me/announcements', { token: p.mehmet })).body).toEqual({ on: true });
    await t.call('PUT', '/me/announcements', { token: p.ayse, body: { on: false } });
    expect((await t.call('GET', '/me/announcements', { token: p.ayse })).body).toEqual({ on: false });

    await t.call('POST', '/admin/announcements', { token: p.admin, body: { title: 'Kadınlara', body: 'x', audience: 'customers', customerGender: 'female', repeat: 'once' } });
    await t.call('POST', '/admin/announcements', { token: p.admin, body: { title: 'Erkeklere', body: 'y', audience: 'customers', customerGender: 'male', repeat: 'once' } });
    await t.tick();
    // Ayşe turned them off; Mehmet gets the one for men only; staff are not customers.
    expect(t.push.messages.filter((m) => m.data?.kind === 'announcement').map((m) => [m.userId, m.title])).toEqual([[await userIdOf(PHONES.customer2), 'Erkeklere']]);
  });

  it('repeats on chosen weekdays at a time of day, never at night', async () => {
    const p = await people();
    // Monday 26 October 2026, 09:00 in Istanbul. Sundays at 10:00.
    const weekly = await t.call('POST', '/admin/announcements', {
      token: p.admin,
      body: { title: 'Pazar', body: 'Bugün yoğun gün', audience: 'businesses', repeat: 'weekly', weekdays: [7], timeOfDay: 600 },
    });
    expect(new Date(weekly.body.next_run_at).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    await t.tick();
    expect(receivers()).toHaveLength(0);

    t.clock.set('2026-11-01T07:00:30.000Z');
    await t.tick();
    expect(receivers()).toHaveLength(2);
    const [row] = (await t.call('GET', '/admin/announcements', { token: p.admin })).body;
    expect(row).toMatchObject({ active: true, total_sent: 2 });
    expect(new Date(row.next_run_at).toISOString()).toBe('2026-11-08T07:00:00.000Z');

    // Paused, then resumed: it continues from the next Sunday.
    await t.call('PUT', `/admin/announcements/${weekly.body.id}/active`, { token: p.admin, body: { active: false } });
    t.clock.set('2026-11-08T07:00:30.000Z');
    await t.tick();
    expect(receivers()).toHaveLength(2);

    // Not at night, and not in the past.
    const night = await t.call('POST', '/admin/announcements', { token: p.admin, body: { title: 'Gece', body: 'z', audience: 'all', repeat: 'daily', timeOfDay: 23 * 60 } });
    expect(night.body.error).toBe('OUTSIDE_SEND_HOURS');
    const past = await t.call('POST', '/admin/announcements', { token: p.admin, body: { title: 'Dün', body: 'z', audience: 'all', repeat: 'once', sendAt: '2026-11-01T08:00:00+03:00' } });
    expect(past.body.error).toBe('IN_THE_PAST');
  });

  it('a test goes only to the admin’s own phone', async () => {
    const p = await people();
    expect((await t.call('POST', '/admin/announcements/test', { token: p.admin, body: { title: 'Test', body: 'Deneme' } })).body).toEqual({ sent: false, phones: 0 });
    await t.call('POST', '/me/push-device', { token: p.admin, body: { token: 'fcm-token-admin-0123456789', platform: 'android' } });
    expect((await t.call('POST', '/admin/announcements/test', { token: p.admin, body: { title: 'Test', body: 'Deneme' } })).body).toEqual({ sent: true, phones: 1 });
    await t.tick();
    expect(receivers()).toEqual([await userIdOf(PHONES.admin)]);
  });

  it('works out the next time across days and weeks', () => {
    const at = new Date('2026-10-26T06:00:00Z'); // Monday 09:00 Istanbul
    expect(nextRepeat({ repeat: 'daily', time_of_day: 600, weekdays: [] }, at)?.toISOString()).toBe('2026-10-26T07:00:00.000Z');
    expect(nextRepeat({ repeat: 'daily', time_of_day: 480, weekdays: [] }, at)?.toISOString()).toBe('2026-10-27T05:00:00.000Z');
    expect(nextRepeat({ repeat: 'weekly', time_of_day: 600, weekdays: [1] }, new Date('2026-10-26T08:00:00Z'))?.toISOString()).toBe('2026-11-02T07:00:00.000Z');
  });
});
