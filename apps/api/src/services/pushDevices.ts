import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import type { User } from './auth.js';

/**
 * The phones that get this person's push notifications (native app, phase 3).
 * A token belongs to one phone: signing in there with another account moves it.
 */
export async function registerPushDevice(deps: Deps, user: User, input: { token: string; platform: 'android' | 'ios' }) {
  const now = deps.clock.now();
  await deps.db.query(
    `INSERT INTO push_devices (token, user_id, platform, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = EXCLUDED.updated_at`,
    [input.token, user.id, input.platform, now],
  );
}

/** Signing out on a phone: it stops receiving this person's notifications. */
export async function removePushDevice(deps: Deps, user: User, token: string) {
  await deps.db.query('DELETE FROM push_devices WHERE token = $1 AND user_id = $2', [token, user.id]);
}

export async function pushTokensFor(q: Queryable, userId: string) {
  const { rows } = await q.query<{ token: string }>('SELECT token FROM push_devices WHERE user_id = $1', [userId]);
  return rows.map((r) => r.token);
}

/** Firebase said the app is no longer on that phone (uninstalled, or its data cleared). */
export async function forgetPushToken(q: Queryable, token: string) {
  await q.query('DELETE FROM push_devices WHERE token = $1', [token]);
}
