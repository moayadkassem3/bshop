import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import type { Deps } from './deps.js';
import { buildApp } from './http/app.js';
import { FcmKeyError, fcmPush, parseServiceAccount, type FcmKeyProblem } from './fcm.js';
import { consolePush, consoleSms } from './notifications.js';
import { improveShopLinks } from './services/shops.js';
import { ensureAdmins } from './services/admin.js';
import { photoStorageFor } from './storage.js';
import { startWorker } from './worker.js';

// SMS prints to the console until the SMS provider is connected; push goes through Firebase
// once FCM_SERVICE_ACCOUNT_JSON is set (phase 3), and prints too until then.
const config = loadConfig();
// Security (v1.7): outside this computer, sign-in codes must be hashed with a real secret.
if (config.otpSecret === 'dev-only-otp-secret' && !/localhost|127\.0\.0\.1/.test(config.publicWebUrl)) {
  console.error('OTP_SECRET is not set. Refusing to start: set a long random OTP_SECRET.');
  process.exit(1);
}
if (config.demoMode) console.warn('DEMO_MODE is on: sign-in codes are shown on screen. Never use this for real customers.');
const db = createPool(config.databaseUrl);
let fcmAccount: ReturnType<typeof parseServiceAccount> = null;
let fcmProblem: FcmKeyProblem | null = null;
try {
  fcmAccount = parseServiceAccount(config.fcmServiceAccount);
  if (!fcmAccount) fcmProblem = 'missing';
} catch (err) {
  // A mistyped secret must not keep the website down: notifications print until it is fixed.
  fcmProblem = err instanceof FcmKeyError ? err.problem : 'not_json';
}
if (fcmAccount) console.log(`Push notifications: Firebase project ${fcmAccount.project_id}.`);
else console.warn(`Push notifications are printed, not sent: FCM_SERVICE_ACCOUNT_JSON ${fcmProblem === 'missing' ? 'is not set' : `cannot be used (${fcmProblem})`}.`);
const deps: Deps = {
  db,
  clock: systemClock,
  sms: consoleSms,
  push: fcmAccount ? fcmPush(db, fcmAccount) : { ...consolePush, problem: fcmProblem ?? 'missing' },
  photos: photoStorageFor(config, db),
  config,
};

await migrate(db);
// Our team (ADMIN_PHONES) can open the admin panel (/yonetim, v1.7).
await ensureAdmins(deps);
const app = buildApp(deps, { logger: true });
// Links from before v1.7 such as "kuafor-mk" become "mk-avcilar"; the old ones keep redirecting.
for (const r of await improveShopLinks(deps)) app.log.info(`Salon link ${r.from} → ${r.to}`);
const stopWorker = startWorker(deps, (err) => app.log.error(err));
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stopWorker();
    await app.close();
    await db.end();
    process.exit(0);
  });
}
