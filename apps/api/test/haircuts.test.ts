import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PHONES, setupShop, useTestApp } from './helpers.js';

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
