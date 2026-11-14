import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FcmKeyError, fcmPush, parseServiceAccount } from '../src/fcm.js';
import { withoutLink } from '../src/notifications.js';
import { at, book, PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const TOKEN_A = 'fcm-token-phone-a-0123456789';

const userIdOf = async (phone: string) => (await t.db.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0].id as string;
const devices = async () => (await t.db.query('SELECT token, user_id FROM push_devices ORDER BY token')).rows;

describe('push notifications (phase 3)', () => {
  it('a phone is registered to whoever signed in on it last, and removed at sign-out', async () => {
    const ayse = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    const mehmet = await t.login(PHONES.customer2, { names: { firstName: 'Mehmet', lastName: 'Demir' } });

    expect((await t.call('POST', '/me/push-device', { token: ayse, body: { token: TOKEN_A, platform: 'android' } })).status).toBe(204);
    expect(await devices()).toEqual([{ token: TOKEN_A, user_id: await userIdOf(PHONES.customer) }]);

    // Another account on the same phone takes the token over.
    await t.call('POST', '/me/push-device', { token: mehmet, body: { token: TOKEN_A } });
    expect(await devices()).toEqual([{ token: TOKEN_A, user_id: await userIdOf(PHONES.customer2) }]);

    // Someone else cannot remove it; its owner can.
    await t.call('DELETE', '/me/push-device', { token: ayse, body: { token: TOKEN_A } });
    expect(await devices()).toHaveLength(1);
    await t.call('DELETE', '/me/push-device', { token: mehmet, body: { token: TOKEN_A } });
    expect(await devices()).toHaveLength(0);

    expect((await t.call('POST', '/me/push-device', { body: { token: TOKEN_A } })).status).toBe(401);
  });

  it('the customer gets the salon’s answer and a reminder two hours before, in the app', async () => {
    const shop = await setupShop(t);
    const me = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    const customerId = await userIdOf(PHONES.customer);

    const res = await book(t, shop, me, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: at('15:00') });
    const id = res.body.appointments[0].id as string;
    await t.call('POST', `${shop.base}/appointments/${id}/confirm`, { token: cumali });
    await t.tick();

    // The salon's alarm carries the details its new-appointment screen shows.
    const cumaliId = (await t.db.query('SELECT user_id FROM shop_members WHERE id = $1', [shop.staff.cumali])).rows[0].user_id;
    expect(t.push.to(cumaliId).find((m) => m.data.kind === 'request')?.data).toMatchObject({
      appointmentId: id,
      customer: 'Ayşe Kaya',
      startsAt: new Date(at('15:00')).toISOString(),
      deadlineAt: expect.any(String),
    });
    const answer = t.push.to(customerId).find((m) => m.data.template === 'confirmed')!;
    expect(answer).toMatchObject({ title: 'Randevunuz onaylandı', data: { kind: 'customer', appointmentId: id } });
    expect(answer.body).not.toMatch(/https?:/);

    // Not yet two hours before; then once, at two hours.
    t.clock.set(at('12:30'));
    await t.tick();
    expect(t.push.to(customerId).filter((m) => m.title === 'Randevunuz yaklaşıyor')).toHaveLength(0);
    t.clock.set(at('13:01'));
    await t.tick();
    await t.tick();
    const reminders = t.push.to(customerId).filter((m) => m.title === 'Randevunuz yaklaşıyor');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.data).toMatchObject({ kind: 'customer', appointmentId: id });
  });

  it('"Bildirimleri test et" sends an alarm to the person\'s own phones, or says why it cannot', async () => {
    const me = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    expect((await t.call('POST', '/me/push-test', { token: me })).body).toEqual({ sent: false, reason: 'NO_PHONE', phones: 0 });
    await t.call('POST', '/me/push-device', { token: me, body: { token: TOKEN_A } });
    expect((await t.call('POST', '/me/push-test', { token: me })).body).toEqual({ sent: true, phones: 1 });
    expect(t.push.to(await userIdOf(PHONES.customer)).at(-1)).toMatchObject({ title: 'Test alarmı', data: { kind: 'confirmed' } });
  });

  it('the Firebase key survives the usual copy-and-paste damage, and a wrong file is named', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const file = JSON.stringify({ type: 'service_account', project_id: 'p1', client_email: 'a@p1.iam.gserviceaccount.com', private_key: pem }, null, 2);
    const problem = (raw: string) => {
      try {
        parseServiceAccount(raw);
        return null;
      } catch (err) {
        return err instanceof FcmKeyError ? err.problem : 'other';
      }
    };
    for (const raw of [
      file,
      `'${file}'`,
      `FCM_SERVICE_ACCOUNT_JSON : ${file}`,
      JSON.stringify(file), // the whole file pasted as a JSON string
      file.replace(/\\n/g, '\n'), // "\n" in the key turned into real line breaks
      Buffer.from(file).toString('base64'),
      JSON.stringify({ ...JSON.parse(file), private_key: pem.replace(/\n/g, '\\n') }), // doubly escaped
    ]) {
      expect(parseServiceAccount(raw)?.project_id).toBe('p1');
      expect(parseServiceAccount(raw)?.private_key).toContain('\n');
    }
    expect(parseServiceAccount('  ')).toBeNull();
    expect(problem('{"project_info": {"project_id": "p1"}, "client": []}')).toBe('google_services_file');
    expect(problem('{"project_id": "p1"}')).toBe('missing_fields');
    expect(problem('not a key')).toBe('not_json');
    expect(problem(JSON.stringify({ ...JSON.parse(file), private_key: 'broken' }))).toBe('bad_private_key');
  });

  it('outside the salon\'s working hours a push arrives quietly (no alarm, no sound)', async () => {
    const shop = await setupShop(t); // open 10:00–21:00 every day
    const me = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    const cumaliId = (await t.db.query('SELECT user_id FROM shop_members WHERE id = $1', [shop.staff.cumali])).rows[0].user_id;
    const request = (when: string) => book(t, shop, me, { serviceIds: [shop.services.haircut], staffId: shop.staff.cumali, startsAt: when });

    // 09:00, before opening: the new request is quiet.
    t.clock.set(at('09:00'));
    const early = (await request(at('15:00'))).body.appointments[0].id;
    await t.tick();
    expect(t.push.to(cumaliId).find((m) => m.data.appointmentId === early)?.data).toMatchObject({ kind: 'request', quiet: '1' });
    const cumali = await t.login(PHONES.cumali, { portal: 'staff' });
    await t.call('POST', `${shop.base}/appointments/${early}/confirm`, { token: cumali });

    // 12:00, open: it rings as an alarm again.
    t.clock.set(at('12:00'));
    const open = (await request(at('17:00'))).body.appointments[0].id;
    await t.tick();
    expect(t.push.to(cumaliId).find((m) => m.data.appointmentId === open)?.data.quiet).toBeUndefined();

    // 22:30, closed: the request was not answered and is confirmed automatically; the customer hears quietly.
    t.clock.set(at('22:30'));
    await t.tick();
    await t.tick();
    const customerId = await userIdOf(PHONES.customer);
    expect(t.push.to(customerId).find((m) => m.data.template === 'confirmed' && m.data.appointmentId === open)?.data).toMatchObject({ kind: 'customer', quiet: '1' });
  });

  it('the SMS link is left out of the app notification', () => {
    expect(withoutLink('Salon: 26 Ekim Pazartesi 15:00 randevunuz onaylandı (Cumali). Ödeme salonda. Randevularınız: https://x.test/randevularim')).toBe(
      'Salon: 26 Ekim Pazartesi 15:00 randevunuz onaylandı (Cumali). Ödeme salonda.',
    );
    expect(withoutLink('Salon: 15:00 randevu talebiniz salon tarafından kabul edilemedi. Başka bir saat seçmek için: https://x.test/a')).toBe(
      'Salon: 15:00 randevu talebiniz salon tarafından kabul edilemedi.',
    );
    expect(withoutLink('Salon: 15:00 dolu. Yerine 16:00 uygun mu? Son yanıt 15:30: https://x.test/a')).toBe('Salon: 15:00 dolu. Yerine 16:00 uygun mu? Son yanıt 15:30.');
  });

  it('Firebase: signs in with the service account, sends data messages, forgets uninstalled phones', async () => {
    const me = await t.login(PHONES.customer, { names: { firstName: 'Ayşe', lastName: 'Kaya' } });
    await t.call('POST', '/me/push-device', { token: me, body: { token: TOKEN_A } });
    await t.call('POST', '/me/push-device', { token: me, body: { token: 'fcm-token-uninstalled-0000' } });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = parseServiceAccount(
      Buffer.from(JSON.stringify({ project_id: 'demo-project', client_email: 'push@demo.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })).toString(
        'base64',
      ),
    )!;

    const calls: { url: string; body: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
      if (String(init.body).includes('uninstalled')) return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
      return new Response('{"name":"projects/demo-project/messages/1"}');
    }) as typeof fetch;

    const push = fcmPush(t.db, account, fakeFetch);
    await push.send(await userIdOf(PHONES.customer), { title: 'Başlık', body: 'Metin', data: { appointmentId: 'a1', kind: 'request', n: 3 } });
    await push.send(await userIdOf(PHONES.customer), { title: 'İkinci', body: 'Metin', data: {} });

    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1); // the access token is reused
    expect(calls[0]!.body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    const sent = JSON.parse(calls.find((c) => c.url.includes('fcm.googleapis.com'))!.body);
    expect(calls.find((c) => c.url.includes('fcm.googleapis.com'))!.url).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
    expect(sent.message.android.priority).toBe('HIGH');
    expect(sent.message.notification).toBeUndefined();
    expect(sent.message.data).toMatchObject({ title: 'Başlık', body: 'Metin', appointmentId: 'a1', kind: 'request', n: '3' });
    expect((await devices()).map((d) => d.token)).toEqual([TOKEN_A]);
  });
});
