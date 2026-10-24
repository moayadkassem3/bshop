import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { applyAbsence, getAbsence, markAbsence } from '../services/absence.js';
import type { User } from '../services/auth.js';
import { setAutoConfirmHours, updateShopSettings } from '../services/shops.js';
import {
  addStaffAppointment,
  blockTime,
  cancelByShop,
  confirmAppointment,
  declineAppointment,
  listShopAppointments,
  markOutcome,
  removeTimeOff,
} from '../services/staffActions.js';
import {
  addMember,
  createService,
  importCatalog,
  listCatalog,
  listMembers,
  listServices,
  setCustomerBlocked,
  setMemberServices,
  setWorkingHours,
  updateMember,
  updateService,
} from '../services/team.js';
import type { AuthFn } from './app.js';
import { id, shopParams, timestamp, weeklyWindows } from './schemas.js';

const kurus = z.number().int().min(0).max(100_000_000);
const minutes = z.number().int().min(5).max(600);

/** Routes for the staff/owner app. Every route is scoped to a shop the caller belongs to. */
export function staffRoutes(app: FastifyInstance, deps: Deps, auth: AuthFn) {
  app.get('/staff/shops', async (req) => {
    const user: User = await auth(req);
    const { rows } = await deps.db.query(
      `SELECT s.id, s.name, s.slug, m.id AS member_id, m.role, m.display_name
       FROM shop_members m JOIN shops s ON s.id = m.shop_id WHERE m.user_id = $1 AND m.active ORDER BY s.name`,
      [user.id],
    );
    return rows;
  });

  // Appointments
  app.get('/staff/shops/:shopId/appointments', async (req) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    const q = z.object({ from: timestamp, to: timestamp, staffId: id.optional() }).parse(req.query);
    return listShopAppointments(deps, user, shopId, q);
  });

  app.post('/staff/shops/:shopId/appointments', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .object({
        staffId: id,
        serviceIds: z.array(id).min(1).max(10),
        startsAt: timestamp.optional(),
        customerName: z.string().trim().min(1).max(120),
        customerPhone: z.string().min(7).max(20).nullish(),
        walkIn: z.boolean().default(false),
      })
      .refine((b) => b.walkIn || b.startsAt, 'startsAt is required unless walkIn')
      .parse(req.body);
    return reply.status(201).send(await addStaffAppointment(deps, user, shopId, body));
  });

  const action = z.object({ shopId: id, id });
  app.post('/staff/shops/:shopId/appointments/:id/confirm', async (req) => {
    const p = action.parse(req.params);
    return confirmAppointment(deps, await auth(req), p.shopId, p.id);
  });
  app.post('/staff/shops/:shopId/appointments/:id/decline', async (req) => {
    const p = action.parse(req.params);
    return declineAppointment(deps, await auth(req), p.shopId, p.id);
  });
  app.post('/staff/shops/:shopId/appointments/:id/cancel', async (req) => {
    const p = action.parse(req.params);
    return cancelByShop(deps, await auth(req), p.shopId, p.id);
  });
  app.post('/staff/shops/:shopId/appointments/:id/complete', async (req) => {
    const p = action.parse(req.params);
    return markOutcome(deps, await auth(req), p.shopId, p.id, 'completed');
  });
  app.post('/staff/shops/:shopId/appointments/:id/no-show', async (req) => {
    const p = action.parse(req.params);
    return markOutcome(deps, await auth(req), p.shopId, p.id, 'no_show');
  });

  // Blocked time and absences
  const range = z.object({
    staffId: id,
    startsAt: timestamp,
    endsAt: timestamp,
    note: z.string().max(200).nullish(),
  });
  app.post('/staff/shops/:shopId/blocks', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    return reply.status(201).send(await blockTime(deps, user, shopId, range.parse(req.body)));
  });
  app.delete('/staff/shops/:shopId/time-off/:id', async (req, reply) => {
    const p = action.parse(req.params);
    await removeTimeOff(deps, await auth(req), p.shopId, p.id);
    return reply.status(204).send();
  });
  app.post('/staff/shops/:shopId/absences', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    return reply.status(201).send(await markAbsence(deps, user, shopId, range.parse(req.body)));
  });
  app.get('/staff/shops/:shopId/absences/:id', async (req) => {
    const p = action.parse(req.params);
    return getAbsence(deps, await auth(req), p.shopId, p.id);
  });
  app.post('/staff/shops/:shopId/absences/:id/apply', async (req) => {
    const p = action.parse(req.params);
    const body = z
      .object({
        decisions: z.array(
          z.discriminatedUnion('action', [
            z.object({ appointmentId: id, action: z.literal('reassign'), staffId: id }),
            z.object({ appointmentId: id, action: z.literal('cancel') }),
          ]),
        ),
      })
      .parse(req.body);
    return applyAbsence(deps, await auth(req), p.shopId, p.id, body.decisions);
  });

  // Team and hours
  app.get('/staff/shops/:shopId/members', async (req) => {
    const { shopId } = shopParams.parse(req.params);
    return listMembers(deps, await auth(req), shopId);
  });
  app.post('/staff/shops/:shopId/members', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .object({
        phone: z.string().min(7).max(20),
        displayName: z.string().trim().min(1).max(60),
        role: z.enum(['owner', 'staff']).default('staff'),
        bookable: z.boolean().default(true),
      })
      .parse(req.body);
    return reply.status(201).send(await addMember(deps, user, shopId, body));
  });
  app.patch('/staff/shops/:shopId/members/:id', async (req, reply) => {
    const p = action.parse(req.params);
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(60).optional(),
        role: z.enum(['owner', 'staff']).optional(),
        bookable: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    await updateMember(deps, await auth(req), p.shopId, p.id, body);
    return reply.status(204).send();
  });
  app.put('/staff/shops/:shopId/members/:id/hours', async (req, reply) => {
    const p = action.parse(req.params);
    await setWorkingHours(deps, await auth(req), p.shopId, p.id, weeklyWindows.parse(req.body));
    return reply.status(204).send();
  });
  app.put('/staff/shops/:shopId/members/:id/services', async (req, reply) => {
    const p = action.parse(req.params);
    const body = z.array(z.object({ serviceId: id, durationMinutes: minutes.nullish() })).parse(req.body);
    await setMemberServices(deps, await auth(req), p.shopId, p.id, body);
    return reply.status(204).send();
  });

  // Service list (owner sets prices; handoff 2.1)
  app.get('/catalog', async (req) => {
    await auth(req);
    return listCatalog(deps);
  });
  app.get('/staff/shops/:shopId/services', async (req) => {
    const { shopId } = shopParams.parse(req.params);
    return listServices(deps, await auth(req), shopId);
  });
  app.post('/staff/shops/:shopId/services/import', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .array(z.object({ catalogId: z.number().int(), priceKurus: kurus, priceIsStartingFrom: z.boolean().optional() }))
      .min(1)
      .parse(req.body);
    return reply.status(201).send({ serviceIds: await importCatalog(deps, user, shopId, body) });
  });
  const serviceBody = z.object({
    name: z.string().trim().min(1).max(80),
    durationMinutes: minutes,
    priceKurus: kurus,
    priceIsStartingFrom: z.boolean().optional(),
  });
  app.post('/staff/shops/:shopId/services', async (req, reply) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    return reply.status(201).send({ id: await createService(deps, user, shopId, serviceBody.parse(req.body)) });
  });
  app.patch('/staff/shops/:shopId/services/:id', async (req, reply) => {
    const p = action.parse(req.params);
    const body = serviceBody.partial().extend({ active: z.boolean().optional(), sortOrder: z.number().int().optional() }).parse(req.body);
    await updateService(deps, await auth(req), p.shopId, p.id, body);
    return reply.status(204).send();
  });

  // Shop settings and customers (owner)
  app.patch('/staff/shops/:shopId/settings', async (req) => {
    const user = await auth(req);
    const { shopId } = shopParams.parse(req.params);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        phone: z.string().min(7).max(20).nullable(),
        address: z.string().max(300).nullable(),
        latitude: z.number().min(-90).max(90).nullable(),
        longitude: z.number().min(-180).max(180).nullable(),
        audience: z.enum(['men', 'women', 'unisex']),
        cancellationCutoffMinutes: z.number().int().min(0).max(10_080),
        minLeadMinutes: z.number().int().min(0).max(1440),
        bufferMinutes: z.number().int().min(0).max(60),
        slotStepMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
        bookingHorizonDays: z.number().int().min(1).max(365),
        maxFutureBookings: z.number().int().min(1).max(20),
      })
      .partial()
      .parse(req.body);
    return updateShopSettings(deps, user, shopId, body);
  });
  app.put('/staff/shops/:shopId/auto-confirm-hours', async (req, reply) => {
    const { shopId } = shopParams.parse(req.params);
    await setAutoConfirmHours(deps, await auth(req), shopId, weeklyWindows.parse(req.body));
    return reply.status(204).send();
  });
  app.post('/staff/shops/:shopId/customers/:id/block', async (req, reply) => {
    const p = action.parse(req.params);
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    await setCustomerBlocked(deps, await auth(req), p.shopId, p.id, blocked);
    return reply.status(204).send();
  });
}
