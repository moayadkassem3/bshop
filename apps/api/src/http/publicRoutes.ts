import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { requestOtp, verifyOtp } from '../services/auth.js';
import { firstAvailable, getAvailability, getShopProfile } from '../services/availability.js';
import { listPublicShops } from '../services/shops.js';
import type { AuthFn } from './app.js';
import { csvIds, id } from './schemas.js';

export function publicRoutes(app: FastifyInstance, deps: Deps, _auth: AuthFn) {
  app.post('/auth/otp/request', async (req, reply) => {
    const body = z.object({ phone: z.string().min(7).max(20) }).parse(req.body);
    await requestOtp(deps, body.phone);
    return reply.status(204).send();
  });

  app.post('/auth/otp/verify', async (req) => {
    const body = z
      .object({
        phone: z.string().min(7).max(20),
        code: z.string().regex(/^\d{6}$/),
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().min(1).max(60).optional(),
      })
      .parse(req.body);
    return verifyOtp(deps, body);
  });

  // Web map: only reviewed, subscribed shops (handoff 2).
  app.get('/public/shops', async (req) => {
    const q = z
      .object({
        minLat: z.coerce.number(),
        maxLat: z.coerce.number(),
        minLng: z.coerce.number(),
        maxLng: z.coerce.number(),
      })
      .parse(req.query);
    return listPublicShops(deps, q);
  });

  app.get('/public/shops/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    return getShopProfile(deps, slug);
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
