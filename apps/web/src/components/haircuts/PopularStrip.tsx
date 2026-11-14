'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { photoAudience, useAudience } from '@/lib/audience';
import { haircutPhotoUrl } from '@/lib/shop';
import type { PopularPost } from '@/lib/types';
import { shopHref } from '@/lib/views';
import styles from './haircuts.module.css';
import { VerifiedTick } from '@/components/VerifiedTick';
import { FORWARD } from '@/lib/motion';

/**
 * "Popüler kesimler" as a horizontal slider at the bottom of Favoriler (v1.7);
 * each photo opens the salon that made it. Follows the customer's Erkek/Kadın
 * choice; men customers always see men's cuts. Hidden until there are posts.
 */
export function PopularStrip() {
  const [picked, , menOnly] = useAudience();
  const audience = photoAudience(picked, menOnly);
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
        <Link transitionTypes={FORWARD} href="/kesimler">Tümü ›</Link>
      </div>
      <div className={styles.strip}>
        {posts.map((p) => (
          <Link transitionTypes={FORWARD} key={p.id} href={shopHref(p.shop_slug, 'kesimler')} className={styles.stripItem} aria-label={`${p.style_name}, ${p.shop_name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={haircutPhotoUrl(p.id)} alt="" loading="lazy" />
            <span>
              {p.style_name}
              <br />
              {p.shop_name}
              {p.shop_verified && <VerifiedTick kind="salon" size={12} />}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
