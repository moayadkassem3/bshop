import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Config } from './config.js';
import type { Queryable } from './db.js';

/** Where shop photos live. Local disk for now; an S3-compatible bucket at launch (milestone 5). */
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export function diskStorage(dir: string): PhotoStorage {
  const root = resolve(dir);
  const pathFor = (key: string) => {
    const path = resolve(join(root, key));
    if (!path.startsWith(root + '/')) throw new Error('Invalid storage key');
    return path;
  };
  return {
    async put(key, data) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
    async get(key) {
      try {
        return await readFile(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

/** Photos kept in PostgreSQL, for test hosts without a lasting disk. */
export function databaseStorage(db: Queryable): PhotoStorage {
  return {
    async put(key, data) {
      await db.query(
        'INSERT INTO photo_blobs (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data',
        [key, data],
      );
    },
    async get(key) {
      const { rows } = await db.query<{ data: Buffer }>('SELECT data FROM photo_blobs WHERE key = $1', [key]);
      return rows[0]?.data ?? null;
    },
    async delete(key) {
      await db.query('DELETE FROM photo_blobs WHERE key = $1', [key]);
    },
  };
}

export function photoStorageFor(config: Config, db: Queryable): PhotoStorage {
  return config.photoStorage === 'database' ? databaseStorage(db) : diskStorage(config.uploadsDir);
}
