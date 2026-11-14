'use client';

import { useMenOnly } from '@/lib/audience';
import { useLikes } from '@/lib/likes';
import type { HaircutPost } from '@/lib/types';
import { HaircutCard } from './HaircutCard';
import styles from './haircuts.module.css';

/** "Çalışmalarımız" on a salon's page: its latest haircut posts, likeable. */
export function ShopWork({ posts, bookUrl, sectionClass, titleClass }: { posts: HaircutPost[]; bookUrl: string; sectionClass: string; titleClass: string }) {
  const { liked, toggle } = useLikes();
  // Men customers see only men's cuts, also on a unisex salon's page; the section goes when
  // none is left (founder, 14 November 2026).
  const menOnly = useMenOnly();
  const shown = menOnly ? posts.filter((p) => p.style_audience !== 'women') : posts;
  if (!shown.length) return null;
  return (
    <section className={sectionClass} aria-labelledby="work-title">
      <h2 id="work-title" className={titleClass}>
        Çalışmalarımız
      </h2>
      <div className={styles.grid}>
        {shown.map((p) => (
          <HaircutCard key={p.id} post={p} href={bookUrl} liked={liked.has(p.id)} onToggleLike={toggle} />
        ))}
      </div>
    </section>
  );
}
