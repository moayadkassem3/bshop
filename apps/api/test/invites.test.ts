import { describe, expect, it } from 'vitest';
import { PHONES, setupShop, useTestApp } from './helpers.js';

const t = useTestApp();
const NEW = '+905324440001';
const userIdOf = async (phone: string) => (await t.db.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0].id as string;

describe('staff invites (founder, 9 November 2026)', () => {
  it('someone who never signed up gets an SMS, joins only when they accept, and the owners hear', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    const sent = await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: '0532 444 00 01', displayName: 'Emre' } });
    expect(sent.status).toBe(201);
    expect(sent.body.sentVia).toBe('sms');
    await t.tick();
    expect(t.sms.to(NEW).at(-1)).toMatch(/ sizi ekibine personel olarak davet etti\. Kabul etmek için bu numarayla giriş yapın: .*\/profil$/);

    // Not on the team yet: not listed, not bookable, cannot use the business entrance.
    const members = (await t.call('GET', `${shop.base}/members`, { token: owner })).body;
    expect(members.some((m: { display_name: string }) => m.display_name === 'Emre')).toBe(false);
    expect((await t.call('GET', `${shop.base}/invites`, { token: owner })).body).toMatchObject([{ display_name: 'Emre', role: 'staff', sent_via: 'sms', phone: NEW }]);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).body.staff.some((m: { display_name: string }) => m.display_name === 'Emre')).toBe(false);
    expect((await t.call('POST', '/auth/otp/request', { body: { phone: NEW, portal: 'business' } })).body.error).toBe('NOT_BUSINESS');

    // They sign up, see the invite and accept it.
    const emre = await t.login(NEW, { names: { firstName: 'Emre', lastName: 'Kaya' } });
    const [invite] = (await t.call('GET', '/me/invites', { token: emre })).body;
    expect(invite).toMatchObject({ shop_name: expect.stringContaining('Nirvana'), role: 'staff', display_name: 'Emre' });
    const accepted = await t.call('POST', `/me/invites/${invite.id}/accept`, { token: emre });
    expect(accepted.status).toBe(200);
    expect((await t.call('GET', `/public/shops/${shop.slug}`)).body.staff.some((m: { display_name: string }) => m.display_name === 'Emre')).toBe(true);
    expect((await t.call('GET', '/me/invites', { token: emre })).body).toEqual([]);
    expect((await t.call('GET', `${shop.base}/invites`, { token: owner })).body).toEqual([]);
    await t.tick();
    expect(t.push.to(await userIdOf(PHONES.owner)).map((m) => m.title)).toContain('Davet kabul edildi');
    // Now a business sign-in works (after the one-code-a-minute limit).
    t.clock.advance(2);
    expect((await t.call('POST', '/auth/otp/request', { body: { phone: NEW, portal: 'business' } })).status).toBe(204);
  });

  it('someone with the app gets a push instead of an SMS', async () => {
    const shop = await setupShop(t);
    const emre = await t.login(NEW, { names: { firstName: 'Emre', lastName: 'Kaya' } });
    await t.call('POST', '/me/push-device', { token: emre, body: { token: 'fcm-token-emre-0123456789', platform: 'android' } });
    const before = t.sms.to(NEW).length;
    const sent = await t.call('POST', `${shop.base}/members`, { token: shop.tokens.owner, body: { phone: NEW, displayName: 'Emre' } });
    expect(sent.body.sentVia).toBe('push');
    await t.tick();
    expect(t.sms.to(NEW)).toHaveLength(before);
    expect(t.push.to(await userIdOf(NEW))).toMatchObject([{ title: 'Ekip daveti', data: { kind: 'invite', inviteId: sent.body.inviteId } }]);
  });

  it('one person works at one salon: refused when inviting, and again when accepting', async () => {
    const a = await setupShop(t);
    const b = await setupShop(t, { slug: 'other-shop', ownerPhone: '+905320000099' });
    // Cumali is staff at A.
    const refused = await t.call('POST', `${b.base}/members`, { token: b.tokens.owner, body: { phone: PHONES.cumali, displayName: 'Cumali' } });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('STAFF_ELSEWHERE');

    // Emre is invited by both; once he joins A, he cannot accept B.
    const toA = await t.call('POST', `${a.base}/members`, { token: a.tokens.owner, body: { phone: NEW, displayName: 'Emre' } });
    const toB = await t.call('POST', `${b.base}/members`, { token: b.tokens.owner, body: { phone: NEW, displayName: 'Emre' } });
    const emre = await t.login(NEW, { names: { firstName: 'Emre', lastName: 'Kaya' } });
    expect((await t.call('POST', `/me/invites/${toA.body.inviteId}/accept`, { token: emre })).status).toBe(200);
    expect((await t.call('POST', `/me/invites/${toB.body.inviteId}/accept`, { token: emre })).body.error).toBe('STAFF_ELSEWHERE');
  });

  it('can be declined, cancelled or sent again (not too often); no duplicates', async () => {
    const shop = await setupShop(t);
    const owner = shop.tokens.owner;
    const sent = await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: NEW, displayName: 'Emre' } });
    expect((await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: NEW, displayName: 'Emre' } })).body.error).toBe('ALREADY_INVITED');
    expect((await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: PHONES.cumali, displayName: 'Cumali' } })).body.error).toBe('ALREADY_MEMBER');

    const resend = () => t.call('POST', `${shop.base}/invites/${sent.body.inviteId}/resend`, { token: owner });
    expect((await resend()).body.error).toBe('RESEND_TOO_SOON');
    t.clock.advance(11);
    expect((await resend()).body).toEqual({ sentVia: 'sms' });

    // Someone else cannot answer it; Emre declines; the owners hear.
    const other = await t.login(PHONES.customer, { names: { firstName: 'A', lastName: 'B' } });
    expect((await t.call('POST', `/me/invites/${sent.body.inviteId}/accept`, { token: other })).status).toBe(404);
    const emre = await t.login(NEW, { names: { firstName: 'Emre', lastName: 'Kaya' } });
    expect((await t.call('POST', `/me/invites/${sent.body.inviteId}/decline`, { token: emre })).status).toBe(204);
    await t.tick();
    expect(t.push.to(await userIdOf(PHONES.owner)).map((m) => m.title)).toContain('Davet reddedildi');

    // A new invite can then be cancelled by the owner.
    const again = await t.call('POST', `${shop.base}/members`, { token: owner, body: { phone: NEW, displayName: 'Emre' } });
    expect((await t.call('DELETE', `${shop.base}/invites/${again.body.inviteId}`, { token: owner })).status).toBe(204);
    expect((await t.call('GET', '/me/invites', { token: emre })).body).toEqual([]);
  });
});
