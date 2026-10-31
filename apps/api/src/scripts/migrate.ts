import { loadConfig } from '../config.js';
import { createPool, migrate } from '../db.js';

const db = createPool(loadConfig().databaseUrl);
const ran = await migrate(db);
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date');
await db.end();
