import { createPrivateKey, createSign } from 'node:crypto';
import type { Db } from './db.js';
import type { PushMessage, PushProvider } from './notifications.js';
import { forgetPushToken, pushTokensFor } from './services/pushDevices.js';

/** The Firebase service account (FCM_SERVICE_ACCOUNT_JSON): only these fields are used. */
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

/** Why the Firebase key cannot be used; never includes any part of the key. */
export type FcmKeyProblem = 'missing' | 'not_json' | 'google_services_file' | 'missing_fields' | 'bad_private_key';

export class FcmKeyError extends Error {
  constructor(readonly problem: FcmKeyProblem) {
    super(`FCM_SERVICE_ACCOUNT_JSON: ${problem}`);
  }
}

/** Real line breaks inside JSON strings (a pasted key whose "\\n" became new lines) made valid again. */
function escapeNewlinesInStrings(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inString && c === '\\') {
      out += c + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString && (c === '\n' || c === '\r')) {
      if (c === '\n') out += '\\n';
      continue;
    }
    out += c;
  }
  return out;
}

function parseLenient(text: string): unknown {
  const attempts = [text, escapeNewlinesInStrings(text)];
  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt) as unknown;
      // Pasted as a JSON string ("{\"type\": ...}"): read it once more.
      return typeof value === 'string' ? parseLenient(value) : value;
    } catch {
      // try the next form
    }
  }
  throw new FcmKeyError('not_json');
}

/**
 * Reads FCM_SERVICE_ACCOUNT_JSON: the JSON file from Firebase (Project settings →
 * Service accounts → Generate new private key), pasted as it is or base64-encoded.
 * Forgives the usual copy-and-paste damage: surrounding quotes, line breaks that
 * replaced "\\n", the whole file pasted as a string. Throws FcmKeyError with the
 * reason, never with the key's text.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  let text = raw?.replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  if (/^(['`])[\s\S]*\1$/.test(text)) text = text.slice(1, -1).trim();
  if (!text.startsWith('{') && !text.startsWith('"')) {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (!decoded.startsWith('{')) throw new FcmKeyError('not_json');
    text = decoded;
  }
  const value = parseLenient(text);
  if (!value || typeof value !== 'object') throw new FcmKeyError('not_json');
  const account = value as Partial<ServiceAccount> & { project_info?: unknown };
  // The app's google-services.json is a different file from the service account key.
  if (account.project_info) throw new FcmKeyError('google_services_file');
  if (!account.project_id || !account.client_email || !account.private_key) throw new FcmKeyError('missing_fields');
  const privateKey = account.private_key.replace(/\\n/g, '\n');
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new FcmKeyError('bad_private_key');
  }
  return { project_id: account.project_id, client_email: account.client_email, private_key: privateKey, token_uri: account.token_uri };
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
    name: 'fcm',
    async send(userId: string, message: PushMessage) {
      const tokens = await pushTokensFor(db, userId);
      if (!tokens.length) {
        console.log(`[push] ${message.title}: no phone signed in for user ${userId}`);
        return;
      }
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
      console.log(`[push] ${message.title}: sent to ${tokens.length - failures.length} of ${tokens.length} phone(s) of user ${userId}`);
    },
  };
}
