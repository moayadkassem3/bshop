import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

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
