import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Agreement texts (content/legal). Versions come from the backend, which records acceptance. */
export const LEGAL_KEYS = [
  'kullanici-sozlesmesi',
  'kvkk-aydinlatma',
  'cerez-politikasi',
  'ticari-ileti-izni',
  'isletme-sozlesmesi',
  'veri-isleme-sozlesmesi',
] as const;

export async function readLegal(key: string): Promise<string | null> {
  if (!(LEGAL_KEYS as readonly string[]).includes(key)) return null;
  return readFile(join(process.cwd(), 'content', 'legal', `${key}.md`), 'utf8');
}
