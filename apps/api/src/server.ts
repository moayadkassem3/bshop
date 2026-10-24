import { systemClock } from './clock.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import type { Deps } from './deps.js';
import { buildApp } from './http/app.js';
import { consolePush, consoleSms } from './notifications.js';
import { startWorker } from './worker.js';

// SMS and push print to the console until the real providers are connected (milestone 4).
const config = loadConfig();
const db = createPool(config.databaseUrl);
const deps: Deps = { db, clock: systemClock, sms: consoleSms, push: consolePush, config };

await migrate(db);
const app = buildApp(deps, { logger: true });
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
