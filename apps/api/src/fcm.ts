import { createSign } from 'node:crypto';
import type { Db } from './db.js';
import type { PushMessage, PushProvider } from './notifications.js';
import { forgetPushToken, pushTokensFor } from './services/pushDevices.js';

/** The Firebase service account (FCM_SERVICE_ACCOUNT_JSON): only these fields are used. */
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

/**
 * Reads FCM_SERVICE_ACCOUNT_JSON: the JSON file from Firebase (Project settings →
 * Service accounts → Generate new private key), pasted as it is or base64-encoded.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  const account = JSON.parse(json) as ServiceAccount;
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key');
  }
  return account;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/**
 * Push notifications through Firebase Cloud Messaging (HTTP v1), phase 3.
 *
 * Messages are data-only and high priority, so the app's own code on the phone
 * decides how each one looks: a new appointment rings as a full-screen alarm with
 * Onayla / Reddet, everything else is an ordinary notification. A notification
 * goes to every phone the person is signed in on; tokens Firebase no longer
 * knows are forgotten.
 */
export function fcmPush(db: Db, account: ServiceAccount, fetchFn: typeof fetch = fetch): PushProvider {
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }));
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
    const res = await fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${base64url(signature)}`,
      }),
    });
    if (!res.ok) throw new Error(`FCM sign-in failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cached.token;
  }

  return {
    async send(userId: string, message: PushMessage) {
      const tokens = await pushTokensFor(db, userId);
      if (!tokens.length) return;
      // FCM data values must be strings.
      const data: Record<string, string> = { title: message.title, body: message.body };
      for (const [key, value] of Object.entries(message.data)) {
        if (value !== null && value !== undefined) data[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      const auth = await accessToken();
      const failures: string[] = [];
      for (const token of tokens) {
        const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message: { token, data, android: { priority: 'HIGH', ttl: '3600s' } } }),
        });
        if (res.ok) continue;
        const text = await res.text();
        // The app was uninstalled, or the token is no longer valid: stop sending to it.
        if (res.status === 404 || text.includes('UNREGISTERED') || (res.status === 400 && text.includes('registration token'))) {
          await forgetPushToken(db, token);
          continue;
        }
        if (res.status === 401) cached = null;
        failures.push(`${res.status} ${text.slice(0, 300)}`);
      }
      // Failed on every phone: the notification is marked failed with the reason.
      if (failures.length && failures.length === tokens.length) throw new Error(`FCM: ${failures.join('; ')}`);
    },
  };
}
