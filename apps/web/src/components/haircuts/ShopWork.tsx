'use client';

import { useLikes } from '@/lib/likes';
import type { HaircutPost } from '@/lib/types';
import { HaircutCard } from './HaircutCard';
import styles from './haircuts.module.css';

/** "Çalışmalarımız" on a salon's page: its latest haircut posts, likeable. */
export function ShopWork({ posts, bookUrl }: { posts: HaircutPost[]; bookUrl: string }) {
  const { liked, toggle } = useLikes();
  return (
    <div className={styles.grid}>
      {posts.map((p) => (
        <HaircutCard key={p.id} post={p} href={bookUrl} liked={liked.has(p.id)} onToggleLike={toggle} />
      ))}
    </div>
  );
}
