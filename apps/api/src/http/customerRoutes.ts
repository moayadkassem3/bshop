import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { updateProfile } from '../services/auth.js';
import { cancelByCustomer, createBooking, listCustomerAppointments } from '../services/booking.js';
import type { AuthFn } from './app.js';
import { id, timestamp } from './schemas.js';

export function customerRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.get('/me', async (req) => auth(req));

  app.patch('/me', async (req) => {
    const user = await auth(req);
    const body = z
      .object({ firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60) })
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

  app.get('/me/appointments', async (req) => listCustomerAppointments(deps, await auth(req)));

  app.post('/me/appointments/:id/cancel', async (req) => {
    const user = await auth(req);
    const params = z.object({ id }).parse(req.params);
    return cancelByCustomer(deps, user, params.id);
  });
}
