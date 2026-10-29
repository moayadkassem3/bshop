import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { requestOtp, verifyOtp } from '../services/auth.js';
import { firstAvailable, getAvailability, getShopProfile } from '../services/availability.js';
import { readPhoto } from '../services/photos.js';
import { shopSummaries } from '../services/favorites.js';
import { LEGAL_DOCUMENTS } from '../domain/legal.js';
import { PLAN_FEATURES, PLAN_TERMS, PLANS } from '../domain/plans.js';
import { nearbyShops, searchPublicShops } from '../services/shops.js';
import { HAIRCUT_STYLES, STYLE_KEYS } from '../domain/styles.js';
import { popularPosts, readPostPhoto } from '../services/haircuts.js';
import { recordShopView, VIEW_SOURCES } from '../services/stats.js';
import { createQuoteRequest } from '../services/quotes.js';
import type { AuthFn } from './app.js';
import { csvIds, id } from './schemas.js';

/** "Salon Sahibi Girişi" and "Çalışan Girişi" are separate entrances; the website signs customers in. */
const portal = z.enum(['customer', 'business', 'staff', 'owner']).default('customer');

export function publicRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.post('/auth/otp/request', async (req, reply) => {
    const body = z.object({ phone: z.string().min(7).max(20), portal }).parse(req.body);
    const { demoCode } = await requestOtp(deps, body.phone, body.portal);
    return demoCode ? reply.send({ demoCode }) : reply.status(204).send();
  });

  app.post('/auth/otp/verify', async (req) => {
    const body = z
      .object({
        phone: z.string().min(7).max(20),
        code: z.string().regex(/^\d{6}$/),
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().min(1).max(60).optional(),
        gender: z.enum(['male', 'female']).optional(),
        portal,
        consents: z.array(z.object({ key: z.string().max(60), version: z.string().max(20) })).max(10).optional(),
      })
      .parse(req.body);
    return verifyOtp(deps, body);
  });

  app.get('/public/nearby', async (req) => {
    const q = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        q: z.string().max(60).optional(),
        audience: z.enum(['men', 'women']).optional(),
        radiusKm: z.coerce.number().min(1).max(100).default(30),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);
    return nearbyShops(deps, { latitude: q.lat, longitude: q.lng, query: q.q, audience: q.audience, radiusKm: q.radiusKm, limit: q.limit });
  });

  app.get('/public/plans', async () => ({ plans: PLANS, features: PLAN_FEATURES, terms: PLAN_TERMS }));

  app.get('/public/legal', async () => LEGAL_DOCUMENTS);

  app.get('/public/search', async (req) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(60) }).parse(req.query);
    return searchPublicShops(deps, q);
  });

  // Favourites saved on a phone before signing in.
  app.get('/public/shop-summaries', async (req) => {
    const { slugs } = z
      .object({ slugs: z.string().transform((s) => s.split(',').filter(Boolean)).pipe(z.array(z.string().max(60)).max(30)) })
      .parse(req.query);
    return shopSummaries(deps, slugs);
  });

  app.get('/public/shops/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    return getShopProfile(deps, slug);
  });

  // "Teklif al": a custom price for more than 10 staff. Signing in is not needed.
  app.post('/public/quote-requests', async (req, reply) => {
    const body = z
      .object({
        salonName: z.string().trim().min(2).max(120),
        contactName: z.string().trim().min(2).max(80),
        phone: z.string().min(7).max(20),
        email: z.string().trim().email().max(120).nullish().or(z.literal('')),
        staffCount: z.number().int().min(1).max(1000),
        branchCount: z.number().int().min(1).max(200).default(1),
        city: z.string().trim().max(40).nullish(),
        message: z.string().trim().max(1000).nullish(),
        source: z.enum(['fiyatlar', 'kayit', 'ayarlar']).catch('fiyatlar'),
        // Left empty by people; bots that fill every field are thanked and ignored.
        website: z.string().max(200).optional(),
      })
      .parse(req.body);
    if (body.website) return reply.status(202).send({ id: null });
    const user = await auth(req).catch(() => null);
    return reply.status(201).send(await createQuoteRequest(deps, body, user));
  });

  // A visit to a salon's page, for its statistics; the page sends it once per browser session.
  app.post('/public/shops/:slug/views', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(60) }).parse(req.params);
    const { source } = z.object({ source: z.enum(VIEW_SOURCES).catch('diger') }).parse(req.body ?? {});
    await recordShopView(deps, slug, source);
    return reply.status(204).send();
  });

  // Re-encoded WebP files; a photo's id never points at different content, so it caches forever.
  app.get('/public/photos/:id', async (req, reply) => {
    const { id: photoId } = z.object({ id }).parse(req.params);
    const data = await readPhoto(deps, photoId);
    return reply.type('image/webp').header('cache-control', 'public, max-age=31536000, immutable').send(data);
  });

  // Popüler kesimler (v1.7)
  app.get('/public/haircut-styles', async () => HAIRCUT_STYLES);
  app.get('/public/haircuts', async (req) => {
    const q = z
      .object({
        audience: z.enum(['men', 'women']).optional(),
        style: z.enum(STYLE_KEYS).optional(),
        limit: z.coerce.number().int().min(1).max(60).optional(),
      })
      .parse(req.query);
    return popularPosts(deps, q);
  });
  app.get('/public/haircut-photos/:id', async (req, reply) => {
    const { id: postId } = z.object({ id }).parse(req.params);
    const data = await readPostPhoto(deps, postId);
    return reply.type('image/webp').header('cache-control', 'public, max-age=31536000, immutable').send(data);
  });

  app.get('/public/shops/:slug/availability', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const q = z
      .object({ date: z.string(), serviceIds: csvIds, staffId: id.optional() })
      .parse(req.query);
    return getAvailability(deps, slug, q);
  });

  app.get('/public/shops/:slug/first-available', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const q = z.object({ serviceIds: csvIds, staffId: id.optional() }).parse(req.query);
    return { result: await firstAvailable(deps, slug, q) };
  });
}
