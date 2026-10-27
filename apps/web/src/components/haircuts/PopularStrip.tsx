'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Audience } from '@/lib/audience';
import { haircutPhotoUrl } from '@/lib/shop';
import type { PopularPost } from '@/lib/types';
import styles from './haircuts.module.css';

/** Keşfet's "Popüler kesimler" row; each photo opens the salon that made it. Hidden until there are posts. */
export function PopularStrip({ audience }: { audience: Audience }) {
  const [posts, setPosts] = useState<PopularPost[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '10' });
    if (audience !== 'all') params.set('audience', audience);
    api<PopularPost[]>(`/public/haircuts?${params}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [audience]);

  if (!posts.length) return null;
  return (
    <section aria-labelledby="popular-title">
      <div className={styles.stripHead}>
        <h2 id="popular-title">Popüler kesimler</h2>
        <Link href="/kesimler">Tümü ›</Link>
      </div>
      <div className={styles.strip}>
        {posts.map((p) => (
          <Link key={p.id} href={`/${p.shop_slug}`} className={styles.stripItem} aria-label={`${p.style_name}, ${p.shop_name}`}>
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
