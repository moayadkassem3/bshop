'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAudience } from '@/lib/audience';
import { haircutPhotoUrl } from '@/lib/shop';
import type { PopularPost } from '@/lib/types';
import { shopHref } from '@/lib/views';
import styles from './haircuts.module.css';

/**
 * "Popüler kesimler" as a horizontal slider at the bottom of Favoriler (v1.7);
 * each photo opens the salon that made it. Follows the customer's Erkek/Kadın
 * choice. Hidden until there are posts.
 */
export function PopularStrip() {
  const [audience] = useAudience();
  const [posts, setPosts] = useState<PopularPost[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '12' });
    if (audience !== 'all') params.set('audience', audience);
    api<PopularPost[]>(`/public/haircuts?${params}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [audience]);

  if (!posts.length) return null;
  return (
    <section aria-labelledby="popular-title" className={styles.stripSection}>
      <div className={styles.stripHead}>
        <h2 id="popular-title">Popüler kesimler</h2>
        <Link href="/kesimler">Tümü ›</Link>
      </div>
      <div className={styles.strip}>
        {posts.map((p) => (
          <Link key={p.id} href={shopHref(p.shop_slug, 'kesimler')} className={styles.stripItem} aria-label={`${p.style_name}, ${p.shop_name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={haircutPhotoUrl(p.id)} alt="" loading="lazy" />
            <span>
              {p.style_name}
              <br />
              {p.shop_name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
