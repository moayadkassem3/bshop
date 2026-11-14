import pg from 'pg';
import { createPool, migrate } from '../src/db.js';

export const TEST_DB = 'bshop_test';
const ADMIN_URL = process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

/** Recreates the test database once per run and applies all migrations. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  const db = createPool(ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`));
  await migrate(db);
  await db.end();
}
