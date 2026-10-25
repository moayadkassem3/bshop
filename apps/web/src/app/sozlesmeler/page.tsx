import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVER_API_URL } from '@/lib/config';
import styles from './legal.module.css';

export const metadata: Metadata = { title: 'Sözleşmeler ve yasal metinler' };

type Doc = { key: string; title: string; version: string };

export default async function LegalIndex() {
  const docs: Doc[] = await fetch(`${SERVER_API_URL}/public/legal`, { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => []);
  return (
    <div className="container narrow">
      <Link href="/profil" className={styles.back}>
        ← Profil
      </Link>
      <h1 className={styles.indexTitle}>Sözleşmeler ve yasal metinler</h1>
      <ul className={`card ${styles.list}`} role="list">
        {docs.map((d) => (
          <li key={d.key}>
            <Link href={`/sozlesmeler/${d.key}`}>
              <span>{d.title}</span>
              <span className="muted">Sürüm {d.version} ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
