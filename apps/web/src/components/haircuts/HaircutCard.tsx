'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { haircutPhotoUrl } from '@/lib/shop';
import type { HaircutPost, PopularPost } from '@/lib/types';
import styles from './haircuts.module.css';
import { VerifiedTick } from '@/components/VerifiedTick';

type Props = {
  post: HaircutPost | PopularPost;
  /** The salon's page; every photo leads to the salon that made the cut. */
  href: string;
  liked: boolean;
  onToggleLike: (postId: string) => Promise<boolean | null>;
};

/** One haircut photo: style, salon, and a like button. */
export function HaircutCard({ post, href, liked, onToggleLike }: Props) {
  const router = useRouter();
  // The count shown moves with the customer's own like, before the server answers.
  const [delta, setDelta] = useState(0);
  const shop = 'shop_name' in post ? post : null;

  async function like() {
    const result = await onToggleLike(post.id);
    if (result === null) return router.push('/profil');
    setDelta((d) => d + (result ? 1 : -1));
  }

  return (
    <article className={styles.card}>
      <Link href={href} className={styles.photoLink} aria-label={shop ? `${post.style_name}, ${shop.shop_name}` : post.style_name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={haircutPhotoUrl(post.id)} alt="" loading="lazy" className={styles.photo} />
        <span className={styles.style}>{post.style_name}</span>
      </Link>
      <div className={styles.footer}>
        {shop ? (
          <Link href={href} className={styles.shop}>
            <strong>
              {shop.shop_name}
              {shop.shop_verified && <VerifiedTick kind="salon" size={14} />}
            </strong>
            {(shop.district || shop.city) && <span>{shop.district || shop.city}</span>}
          </Link>
        ) : (
          <span className={styles.shop}>{post.caption && <span>{post.caption}</span>}</span>
        )}
        <button type="button" className={`${styles.like} ${liked ? styles.liked : ''}`} onClick={like} aria-pressed={liked} aria-label={liked ? 'Beğeniyi geri al' : 'Beğen'}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
            <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.2 1.1 3.9 2.2.4.6 1 .6 1.4 0C12.4 6.1 13.6 5 15.6 5 19 5 20.7 8.4 19.2 11.4 17 15.6 12 20 12 20z" />
          </svg>
          {Math.max(0, post.like_count + delta)}
        </button>
      </div>
    </article>
  );
}
