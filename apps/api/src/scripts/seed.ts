import { loadConfig } from '../config.js';
import { createPool, migrate } from '../db.js';

// Local development data: one platform admin (sign in with this phone; the code prints in the API log).
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+905000000000';

const db = createPool(loadConfig().databaseUrl);
await migrate(db);
await db.query(
  `INSERT INTO users (phone, first_name, last_name, is_platform_admin) VALUES ($1, 'Platform', 'Admin', true)
   ON CONFLICT (phone) DO UPDATE SET is_platform_admin = true`,
  [ADMIN_PHONE],
);
console.log(`Platform admin: ${ADMIN_PHONE}`);
await db.end();
