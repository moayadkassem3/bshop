import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { Deps } from '../deps.js';
import { AppError } from '../errors.js';
import { userForToken, type User } from '../services/auth.js';
import { adminRoutes } from './adminRoutes.js';
import { customerRoutes } from './customerRoutes.js';
import { publicRoutes } from './publicRoutes.js';
import { staffRoutes } from './staffRoutes.js';

export type AuthFn = (req: FastifyRequest) => Promise<User>;

/** Postgres errors that mean "the request conflicts with data", not a server fault. */
const PG_ERRORS: Record<string, [number, string]> = {
  '23P01': [409, 'SLOT_TAKEN'], // exclusion constraint: overlapping appointment
  '23503': [400, 'INVALID_REFERENCE'], // foreign key: e.g. a service from another shop
  '23505': [409, 'ALREADY_EXISTS'],
  '22P02': [400, 'INVALID_INPUT'],
};

export function buildApp(deps: Deps, options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  const auth: AuthFn = async (req) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const user = token ? await userForToken(deps, token) : null;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    return user;
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid request', issues: err.issues });
    }
    const pgCode = (err as { code?: string }).code;
    if (pgCode && PG_ERRORS[pgCode]) {
      const [status, code] = PG_ERRORS[pgCode];
      return reply.status(status).send({ error: code, message: code === 'SLOT_TAKEN' ? 'Bu saat az önce doldu' : code });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'BAD_REQUEST', message: (err as Error).message });
    req.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL', message: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));
  publicRoutes(app, deps, auth);
  customerRoutes(app, deps, auth);
  staffRoutes(app, deps, auth);
  adminRoutes(app, deps, auth);
  return app;
}
