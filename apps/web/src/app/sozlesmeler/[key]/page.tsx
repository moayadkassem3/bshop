import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LEGAL_KEYS, readLegal } from '@/lib/legal';
import { Markdown } from '@/lib/markdown';
import styles from '../legal.module.css';
import { BackArrow } from '@/components/BackArrow';

type Props = { params: Promise<{ key: string }> };

export function generateStaticParams() {
  return LEGAL_KEYS.map((key) => ({ key }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const source = await readLegal((await params).key);
  return { title: source?.split('\n')[0]?.replace(/^# /, '') ?? 'Sözleşme' };
}

export default async function LegalPage({ params }: Props) {
  const source = await readLegal((await params).key);
  if (!source) notFound();
  return (
    <div className="container narrow">
      <Link href="/sozlesmeler" className={styles.back}>
        <BackArrow />
        Tüm metinler
      </Link>
      <article className={styles.doc}>
        <Markdown source={source} />
      </article>
    </div>
  );
}
