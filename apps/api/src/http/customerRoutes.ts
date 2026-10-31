import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { switchMode, updateProfile } from '../services/auth.js';
import { cancelByCustomer, createBooking, listCustomerAppointments } from '../services/booking.js';
import { addFavorite, listCustomerShops, removeFavorite } from '../services/favorites.js';
import { listConsents, recordConsents, withdrawConsent } from '../services/consents.js';
import { likedPostIds, likePost, unlikePost } from '../services/haircuts.js';
import { listMyNotifications } from '../services/inbox.js';
import { registerShop } from '../services/registration.js';
import type { AuthFn } from './app.js';
import { id, timestamp } from './schemas.js';
import { acceptOffer, declineOffer } from '../services/offers.js';

export function customerRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.get('/me', async (req) => {
    const user = await auth(req);
    // Profil (v1.7): owners and co-owners do not need "İşletmenizi kaydedin"; only people
    // who work at a salon see the switch to business mode.
    const { rows } = await deps.db.query<{ role: string }>('SELECT role FROM shop_members WHERE user_id = $1 AND active', [user.id]);
    // Verified tick (v1.7): three completed visits booked through the app.
    const tick = await deps.db.query<{ verified: boolean }>('SELECT verified_at IS NOT NULL AS verified FROM users WHERE id = $1', [user.id]);
    return { ...user, owns_shop: rows.some((r) => r.role === 'owner'), has_business: rows.length > 0, verified: tick.rows[0]?.verified ?? false };
  });

  app.post('/me/switch', async (req) => {
    const user = await auth(req);
    const { to } = z.object({ to: z.enum(['customer', 'business']) }).parse(req.body);
    return switchMode(deps, user, to);
  });

  app.get('/me/notifications', async (req) => {
    const user = await auth(req);
    const q = z.object({ after: timestamp.optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    return listMyNotifications(deps, user, q);
  });

  app.get('/me/likes', async (req) => likedPostIds(deps, await auth(req)));
  app.put('/me/likes/:id', async (req, reply) => {
    const user = await auth(req);
    await likePost(deps, user, z.object({ id }).parse(req.params).id);
    return reply.status(204).send();
  });
  app.delete('/me/likes/:id', async (req, reply) => {
    const user = await auth(req);
    await unlikePost(deps, user, z.object({ id }).parse(req.params).id);
    return reply.status(204).send();
  });

  app.patch('/me', async (req) => {
    const user = await auth(req);
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().min(1).max(60),
        gender: z.enum(['male', 'female']).nullish(),
      })
      .parse(req.body);
    return updateProfile(deps, user, body);
  });

  app.post('/shops/:slug/bookings', async (req, reply) => {
    const user = await auth(req);
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().min(1).max(60).optional(),
        items: z
          .array(
            z.object({
              serviceIds: z.array(id).min(1).max(10),
              staffId: id.nullable(),
              startsAt: timestamp,
              guestName: z.string().trim().min(1).max(60).nullish(),
            }),
          )
          .min(1),
      })
      .parse(req.body);
    return reply.status(201).send(await createBooking(deps, user, slug, body));
  });

  // "Salonlarım": favourites and shops booked before.
  app.get('/me/shops', async (req) => listCustomerShops(deps, await auth(req)));

  app.put('/me/favorites/:slug', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    await addFavorite(deps, await auth(req), slug);
    return reply.status(204).send();
  });

  app.delete('/me/favorites/:slug', async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    await removeFavorite(deps, await auth(req), slug);
    return reply.status(204).send();
  });

  // Agreements: accept the current versions, list what was accepted, withdraw optional ones.
  const consentList = z.array(z.object({ key: z.string().max(60), version: z.string().max(20) })).min(1).max(10);
  app.get('/me/consents', async (req) => listConsents(deps, await auth(req)));
  app.post('/me/consents', async (req, reply) => {
    const user = await auth(req);
    await recordConsents(deps.db, user.id, consentList.parse(req.body), deps.clock.now());
    return reply.status(204).send();
  });
  app.post('/me/consents/:key/withdraw', async (req, reply) => {
    const { key } = z.object({ key: z.string() }).parse(req.params);
    await withdrawConsent(deps, await auth(req), key);
    return reply.status(204).send();
  });

  // Self-service shop registration (v1.6): the signed-in person becomes the owner.
  app.post('/registrations', async (req, reply) => {
    const user = await auth(req);
    const minute = z.number().int().min(0).max(1440);
    const kurus = z.number().int().min(0).max(100_000_000);
    const body = z
      .object({
        audience: z.enum(['men', 'women', 'unisex']),
        name: z.string().trim().min(2).max(80),
        phone: z.string().min(7).max(20),
        whatsapp: z.string().min(7).max(20).nullish(),
        instagram: z.string().max(120).nullish(),
        about: z.string().max(600).nullish(),
        city: z.string().trim().min(2).max(40),
        district: z.string().trim().min(2).max(80),
        address: z.string().trim().min(5).max(300),
        latitude: z.number().min(35).max(43),
        longitude: z.number().min(25).max(45),
        hours: z
          .array(
            z
              .object({ weekday: z.number().int().min(1).max(7), startMinute: minute, endMinute: minute })
              .refine((w) => w.endMinute > w.startMinute, 'Closing time must be after opening time'),
          )
          .max(14),
        services: z
          .array(
            z.union([
              z.object({ catalogId: z.number().int(), priceKurus: kurus, priceIsStartingFrom: z.boolean().optional() }),
              z.object({
                name: z.string().trim().min(2).max(80),
                durationMinutes: z.number().int().min(5).max(600),
                priceKurus: kurus,
                priceIsStartingFrom: z.boolean().optional(),
              }),
            ]),
          )
          .max(80),
        owner: z.object({ displayName: z.string().trim().min(1).max(60), bookable: z.boolean() }),
        members: z
          .array(
            z.object({
              displayName: z.string().trim().min(1).max(60),
              phone: z.string().min(7).max(20),
              role: z.enum(['staff', 'co_owner']),
              bookable: z.boolean().default(true),
            }),
          )
          .max(30),
        consents: consentList,
      })
      .parse(req.body);
    return reply.status(201).send(await registerShop(deps, user, body));
  });

  app.get('/me/appointments', async (req) => listCustomerAppointments(deps, await auth(req)));

  // The customer's answer to a time the salon offered (v1.7).
  app.post('/me/appointments/:id/accept-offer', async (req) => {
    const user = await auth(req);
    return acceptOffer(deps, user, z.object({ id }).parse(req.params).id);
  });
  app.post('/me/appointments/:id/decline-offer', async (req) => {
    const user = await auth(req);
    return declineOffer(deps, user, z.object({ id }).parse(req.params).id);
  });

  app.post('/me/appointments/:id/cancel', async (req) => {
    const user = await auth(req);
    const params = z.object({ id }).parse(req.params);
    return cancelByCustomer(deps, user, params.id);
  });
}
