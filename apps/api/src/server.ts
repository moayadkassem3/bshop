import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import type { Deps } from './deps.js';
import { buildApp } from './http/app.js';
import { consolePush, consoleSms } from './notifications.js';
import { improveShopLinks } from './services/shops.js';
import { photoStorageFor } from './storage.js';
import { startWorker } from './worker.js';

// SMS and push print to the console until the real providers are connected (milestone 4).
const config = loadConfig();
const db = createPool(config.databaseUrl);
const deps: Deps = {
  db,
  clock: systemClock,
  sms: consoleSms,
  push: consolePush,
  photos: photoStorageFor(config, db),
  config,
};

await migrate(db);
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
