import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { createShop, listShopsForAdmin, markReviewed, setSubscription } from '../services/shops.js';
import { RESERVED_SLUGS } from '../domain/slug.js';
import { listQuoteRequests } from '../services/quotes.js';
import {
  adminOverview,
  adminRatings,
  adminRequests,
  adminShop,
  adminShops,
  cancelSubscription,
  extendTrial,
  hideRating,
  markChecked,
  recordPayment,
  setQuoteStatus,
  suspendShop,
} from '../services/admin.js';
import type { AuthFn } from './app.js';
import { id, shopParams, timestamp } from './schemas.js';

/** Back office for our team: create shops on site, review, and manage subscriptions. */
export function adminRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.get('/admin/shops', async (req) => listShopsForAdmin(deps, await auth(req)));

  // Admin panel (/yonetim, v1.7).
  app.get('/admin/overview', async (req) => adminOverview(deps, await auth(req)));
  app.get('/admin/salons', async (req) => {
    const q = z
      .object({ filter: z.enum(['tumu', 'yeni', 'deneme', 'aktif', 'odeme', 'kapali']).catch('tumu'), q: z.string().max(80).optional() })
      .parse(req.query);
    return adminShops(deps, await auth(req), q);
  });
  app.get('/admin/salons/:shopId', async (req) => adminShop(deps, await auth(req), shopParams.parse(req.params).shopId));
  app.post('/admin/salons/:shopId/payments', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .object({
        amountKurus: z.number().int().min(0).max(100_000_000),
        months: z.number().int().min(1).max(24),
        method: z.enum(['havale', 'nakit', 'kart', 'diger', 'yok']),
        note: z.string().trim().max(300).nullish(),
      })
      .parse(req.body);
    return reply.status(201).send(await recordPayment(deps, await auth(req), shopId, body));
  });
  app.post('/admin/salons/:shopId/extend-trial', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    const { days } = z.object({ days: z.number().int().min(1).max(60) }).parse(req.body);
    await extendTrial(deps, await auth(req), shopId, days);
    return reply.status(204).send();
  });
  app.post('/admin/salons/:shopId/cancel-subscription', async (req, reply) => {
    await cancelSubscription(deps, await auth(req), shopParams.parse(req.params).shopId);
    return reply.status(204).send();
  });
  app.put('/admin/salons/:shopId/checked', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    const { checked } = z.object({ checked: z.boolean() }).parse(req.body);
    await markChecked(deps, await auth(req), shopId, checked);
    return reply.status(204).send();
  });
  app.put('/admin/salons/:shopId/suspension', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300).nullable() }).parse(req.body);
    await suspendShop(deps, await auth(req), shopId, reason);
    return reply.status(204).send();
  });
  app.get('/admin/requests', async (req) => adminRequests(deps, await auth(req)));
  app.put('/admin/quote-requests/:id', async (req, reply) => {
    const p = z.object({ id }).parse(req.params);
    const { status } = z.object({ status: z.enum(['new', 'contacted', 'closed']) }).parse(req.body);
    await setQuoteStatus(deps, await auth(req), p.id, status);
    return reply.status(204).send();
  });
  app.get('/admin/ratings', async (req) => {
    const { low } = z.object({ low: z.enum(['1', '0']).optional() }).parse(req.query);
    return adminRatings(deps, await auth(req), { low: low === '1' });
  });
  app.put('/admin/ratings/:id/hidden', async (req, reply) => {
    const p = z.object({ id }).parse(req.params);
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    await hideRating(deps, await auth(req), p.id, hidden);
    return reply.status(204).send();
  });

  // Custom-price requests from salons with more than 10 staff.
  app.get('/admin/quote-requests', async (req) => listQuoteRequests(deps, await auth(req)));

  app.post('/admin/shops', async (req, reply) => {
    const user = await auth(req);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        slug: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
          .min(3)
          .max(60)
          .refine((s) => !RESERVED_SLUGS.has(s), 'This link is reserved'),
        phone: z.string().min(7).max(20).optional(),
        address: z.string().max(300).optional(),
        district: z.string().max(80).optional(),
        city: z.string().max(40).optional(),
        whatsapp: z.string().min(7).max(20).optional(),
        instagram: z.string().max(120).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        audience: z.enum(['men', 'women', 'unisex']).optional(),
        owner: z.object({
          phone: z.string().min(7).max(20),
          firstName: z.string().trim().min(1).max(60),
          lastName: z.string().trim().min(1).max(60),
          displayName: z.string().trim().min(1).max(60),
          bookable: z.boolean().default(true),
        }),
      })
      .parse(req.body);
    return reply.status(201).send(await createShop(deps, user, body));
  });

  app.post('/admin/shops/:shopId/review', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    await markReviewed(deps, await auth(req), shopId);
    return reply.status(204).send();
  });

  app.put('/admin/shops/:shopId/subscription', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .object({
        status: z.enum(['none', 'trial', 'active', 'past_due', 'canceled']),
        currentPeriodEnd: timestamp.nullish(),
        graceUntil: timestamp.nullish(),
      })
      .parse(req.body);
    await setSubscription(deps, await auth(req), shopId, body);
    return reply.status(204).send();
  });
}
