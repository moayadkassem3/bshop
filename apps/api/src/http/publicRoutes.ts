import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { requestOtp, verifyOtp } from '../services/auth.js';
import { firstAvailable, getAvailability, getShopProfile } from '../services/availability.js';
import { readPhoto } from '../services/photos.js';
import { shopSummaries } from '../services/favorites.js';
import { searchPublicShops } from '../services/shops.js';
import type { AuthFn } from './app.js';
import { csvIds, id } from './schemas.js';

/** "Salon Sahibi Girişi" and "Çalışan Girişi" are separate entrances; the website signs customers in. */
const portal = z.enum(['customer', 'staff', 'owner']).default('customer');

export function publicRoutes(app: FastifyInstance, deps: Deps, _auth: AuthFn) {
  app.post('/auth/otp/request', async (req, reply) => {
    const body = z.object({ phone: z.string().min(7).max(20), portal }).parse(req.body);
    await requestOtp(deps, body.phone, body.portal);
    return reply.status(204).send();
  });

  app.post('/auth/otp/verify', async (req) => {
    const body = z
      .object({
        phone: z.string().min(7).max(20),
        code: z.string().regex(/^\d{6}$/),
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().min(1).max(60).optional(),
        portal,
      })
      .parse(req.body);
    return verifyOtp(deps, body);
  });

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

  // Re-encoded WebP files; a photo's id never points at different content, so it caches forever.
  app.get('/public/photos/:id', async (req, reply) => {
    const { id: photoId } = z.object({ id }).parse(req.params);
    const data = await readPhoto(deps, photoId);
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
