import { afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { currentVersion } from '../src/domain/legal.js';
import { createPool } from '../src/db.js';
import type { Deps } from '../src/deps.js';
import { buildApp } from '../src/http/app.js';
import type { PushMessage, PushProvider, SmsProvider } from '../src/notifications.js';
import { diskStorage } from '../src/storage.js';
import { tick } from '../src/worker.js';

export class TestClock {
  constructor(private t: Date) {}
  now = () => new Date(this.t);
  set(iso: string) {
    this.t = new Date(iso);
  }
  advance(minutes: number) {
    this.t = new Date(this.t.getTime() + minutes * 60_000);
  }
}

export class MemorySms implements SmsProvider {
  messages: { to: string; text: string }[] = [];
  async send(to: string, text: string) {
    this.messages.push({ to, text });
  }
  to(phone: string) {
    return this.messages.filter((m) => m.to === phone).map((m) => m.text);
  }
}

export class MemoryPush implements PushProvider {
  messages: ({ userId: string } & PushMessage)[] = [];
  async send(userId: string, message: PushMessage) {
    this.messages.push({ userId, ...message });
  }
  to(userId: string) {
    return this.messages.filter((m) => m.userId === userId);
  }
}

/** Monday 26 October 2026, 09:00 in Istanbul (UTC+3). */
export const MONDAY_9AM = '2026-10-26T06:00:00.000Z';

/** Istanbul local time on Monday 26 October 2026, as an ISO instant. */
export const at = (hhmm: string, date = '2026-10-26') => new Date(`${date}T${hhmm}:00+03:00`).toISOString();

const TABLES = `photo_blobs, consents, customer_favorites, shop_photos, notifications, appointment_services, appointments, booking_groups, shop_customers, member_services,
  services, auto_confirm_hours, time_off, working_hours, shop_members, subscriptions, shops, sessions, otp_codes, users`;

export function useTestApp() {
  const config = { ...loadConfig(), databaseUrl: 'postgres://postgres:postgres@localhost:5432/bshop_test' };
  const db = createPool(config.databaseUrl);
  const clock = new TestClock(new Date(MONDAY_9AM));
  const sms = new MemorySms();
  const push = new MemoryPush();
  const photos = diskStorage(mkdtempSync(join(tmpdir(), 'bshop-photos-')));
  const deps: Deps = { db, clock, sms, push, photos, config };
  const app: FastifyInstance = buildApp(deps);
  const sessions = new Map<string, string>();

  const ctx = {
    deps,
    db,
    clock,
    sms,
    push,
    app,
    /** Runs the worker once: due timers, then sends queued SMS/push. */
    tick: () => tick(deps),
    async call(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: string,
      opts: { token?: string; body?: unknown; contentType?: string } = {},
    ) {
      const res = await app.inject({
        method,
        url,
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.contentType ? { 'content-type': opts.contentType } : {}),
        },
        ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
      });
      const isJson = res.headers['content-type']?.toString().includes('json');
      return { status: res.statusCode, body: res.body && isJson ? res.json() : null, raw: res.rawPayload };
    },
    /** Signs in through the real SMS-code flow and returns a session token (reused per phone within a test). */
    async login(
      phone: string,
      opts: {
        names?: { firstName: string; lastName: string; gender?: 'male' | 'female' };
        portal?: 'customer' | 'business' | 'staff' | 'owner';
        /** Customers accept the user agreement at sign-in unless told otherwise. */
        acceptTerms?: boolean;
      } = {},
    ) {
      const portal = opts.portal ?? 'customer';
      const key = `${portal}:${phone}`;
      const cached = sessions.get(key);
      if (cached) return cached;
      // The resend limit is per phone; step past it when the same phone signs in through another entrance.
      if ([...sessions.keys()].some((k) => k.endsWith(`:${phone}`))) clock.advance(1);
      const req = await ctx.call('POST', '/auth/otp/request', { body: { phone, portal } });
      if (req.status !== 204) throw new Error(`OTP request failed: ${JSON.stringify(req.body)}`);
      await tick(deps);
      const text = sms.to(phone).at(-1)!;
      const code = text.match(/(\d{6})/)![1];
      const consents =
        portal === 'customer' && opts.acceptTerms !== false ? [{ key: 'kullanici-sozlesmesi', version: currentVersion('kullanici-sozlesmesi') }] : undefined;
      const res = await ctx.call('POST', '/auth/otp/verify', { body: { phone, code, portal, consents, ...opts.names } });
      if (res.status !== 200) throw new Error(`OTP verify failed: ${JSON.stringify(res.body)}`);
      sessions.set(key, res.body.token);
      return res.body.token as string;
    },
  };

  beforeEach(async () => {
    await db.query(`TRUNCATE ${TABLES} CASCADE`);
    clock.set(MONDAY_9AM);
    sessions.clear();
    sms.messages = [];
    push.messages = [];
  });
  afterAll(async () => {
    await app.close();
    await db.end();
  });
  return ctx;
}

export type TestCtx = ReturnType<typeof useTestApp>;

export const PHONES = {
  admin: '+905000000000',
  owner: '+905320000001',
  cumali: '+905320000002',
  tahir: '+905320000003',
  customer: '+905550000001',
  customer2: '+905550000002',
};

/**
 * A reviewed, subscribed barbershop like the founder's example: owner Salih
 * (bookable), staff Cumali and Tahir, open 10:00–21:00 every day, with three
 * services. Tahir does not do beards.
 */
export async function setupShop(t: TestCtx, opts: { slug?: string; ownerPhone?: string } = {}) {
  const slug = opts.slug ?? 'nirvana-for-men';
  await t.db.query(
    `INSERT INTO users (phone, first_name, last_name, is_platform_admin) VALUES ($1, 'Platform', 'Admin', true)
     ON CONFLICT (phone) DO NOTHING`,
    [PHONES.admin],
  );
  const admin = await t.login(PHONES.admin);
  const created = await t.call('POST', '/admin/shops', {
    token: admin,
    body: {
      name: 'Salih Esen Nirvana For Men',
      slug,
      address: 'Kadıköy, İstanbul',
      latitude: 40.99,
      longitude: 29.03,
      owner: {
        phone: opts.ownerPhone ?? PHONES.owner,
        firstName: 'Salih',
        lastName: 'Esen',
        displayName: 'Salih Esen',
        bookable: true,
      },
    },
  });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const shopId: string = created.body.shopId;
  const salihId: string = created.body.ownerMemberId;
  await t.call('POST', `/admin/shops/${shopId}/review`, { token: admin });
  await t.call('PUT', `/admin/shops/${shopId}/subscription`, { token: admin, body: { status: 'active' } });

  const owner = await t.login(opts.ownerPhone ?? PHONES.owner, { portal: 'owner' });
  const base = `/staff/shops/${shopId}`;
  // Catalog ids 1–3: Saç Kesimi (30), Sakal Tıraşı (20), Saç-Sakal Kesimi (60).
  const imported = await t.call('POST', `${base}/services/import`, {
    token: owner,
    body: [
      { catalogId: 1, priceKurus: 45000 },
      { catalogId: 2, priceKurus: 30000 },
      { catalogId: 3, priceKurus: 60000 },
    ],
  });
  const [haircut, beard, combo] = imported.body.serviceIds as string[];

  const cumaliId = (
    await t.call('POST', `${base}/members`, { token: owner, body: { phone: PHONES.cumali, displayName: 'Cumali Esen' } })
  ).body.memberId as string;
  const tahirId = (
    await t.call('POST', `${base}/members`, { token: owner, body: { phone: PHONES.tahir, displayName: 'Tahir Ali Esen' } })
  ).body.memberId as string;

  const everyDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 600, endMinute: 1260 }));
  for (const memberId of [salihId, cumaliId, tahirId]) {
    await t.call('PUT', `${base}/members/${memberId}/hours`, { token: owner, body: everyDay });
    const services = memberId === tahirId ? [haircut] : [haircut, beard, combo];
    await t.call('PUT', `${base}/members/${memberId}/services`, {
      token: owner,
      body: services.map((serviceId) => ({ serviceId })),
    });
  }
  return {
    slug,
    shopId,
    base,
    tokens: { admin, owner },
    staff: { salih: salihId, cumali: cumaliId, tahir: tahirId },
    services: { haircut: haircut!, beard: beard!, combo: combo! },
  };
}

export type ShopFixture = Awaited<ReturnType<typeof setupShop>>;

export async function book(
  t: TestCtx,
  shop: ShopFixture,
  token: string,
  item: { serviceIds: string[]; staffId: string | null; startsAt: string; guestName?: string },
  extra: Record<string, unknown> = {},
) {
  return t.call('POST', `/shops/${shop.slug}/bookings`, { token, body: { items: [item], ...extra } });
}
