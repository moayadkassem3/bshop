import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { createShop, listShopsForAdmin, markReviewed, setSubscription } from '../services/shops.js';
import type { AuthFn } from './app.js';
import { shopParams, timestamp } from './schemas.js';

/** Shop links live at the website's top level (/<slug>), so they must not clash with its pages. */
const RESERVED_SLUGS = new Set([
  'api', 'admin', 'harita', 'randevularim', 'isletmeler', 'giris', 'hesap', 'yardim', 'gizlilik', 'kvkk',
  'sozlesme', 'iletisim', 'hakkimizda', 'arama', 'salon', 'salonlar', 'uygulama', 'static', 'favicon-ico',
]);

/** Back office for our team: create shops on site, review, and manage subscriptions. */
export function adminRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.get('/admin/shops', async (req) => listShopsForAdmin(deps, await auth(req)));

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
