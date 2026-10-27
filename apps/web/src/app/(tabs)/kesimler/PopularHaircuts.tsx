'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HaircutCard } from '@/components/haircuts/HaircutCard';
import grid from '@/components/haircuts/haircuts.module.css';
import { api } from '@/lib/api';
import { useAudience } from '@/lib/audience';
import { useLikes } from '@/lib/likes';
import type { HaircutStyle, PopularPost } from '@/lib/types';
import styles from '../randevularim/appointments.module.css';
import own from './kesimler.module.css';

/**
 * Popüler kesimler (v1.7): salons' work from across Türkiye, most liked and
 * newest first. Every photo leads to the salon that made it.
 */
export function PopularHaircuts() {
  const [audience, pickAudience] = useAudience();
  const [style, setStyle] = useState<string | null>(null);
  const [styleList, setStyleList] = useState<HaircutStyle[]>([]);
  const [posts, setPosts] = useState<PopularPost[] | null>(null);
  const { liked, toggle } = useLikes();

  useEffect(() => {
    api<HaircutStyle[]>('/public/haircut-styles')
      .then(setStyleList)
      .catch(() => setStyleList([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '60' });
    if (style) params.set('style', style);
    else if (audience !== 'all') params.set('audience', audience);
    api<PopularPost[]>(`/public/haircuts?${params}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [audience, style]);

  const styleChoices = styleList.filter((s) => audience === 'all' || s.audience === audience);

  return (
    <>
      <header className={`page-header ${styles.header}`}>
        <div className="container narrow">
          <Link href="/" className={own.back}>
            ← Keşfet
          </Link>
          <h1>Popüler kesimler</h1>
          <p>Salonların son çalışmaları. Beğendiğin kesime dokun, salonundan randevu al.</p>
        </div>
      </header>
      <div className={`container narrow ${styles.body}`}>
        <div className={`${styles.chips} ${own.scroll}`} role="radiogroup" aria-label="Salon türü">
          {(
            [
              ['all', 'Tümü'],
              ['men', 'Erkek'],
              ['women', 'Kadın'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={audience === value}
              className={`${styles.chip} ${audience === value ? styles.chipOn : ''}`}
              onClick={() => {
                pickAudience(value);
                setStyle(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {styleChoices.length > 0 && (
          <div className={own.styles} role="radiogroup" aria-label="Kesim">
            {styleChoices.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={style === s.key} className={style === s.key ? own.styleOn : ''} onClick={() => setStyle(style === s.key ? null : s.key)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        {posts && posts.length === 0 && (
          <div className={`card ${styles.empty}`}>
            <h2>Henüz paylaşım yok</h2>
            <p>Salonlar çalışmalarını paylaştıkça burada görünecek.</p>
          </div>
        )}
        <div className={grid.grid}>
          {posts?.map((p) => (
            <HaircutCard key={p.id} post={p} href={`/${p.shop_slug}`} liked={liked.has(p.id)} onToggleLike={toggle} />
          ))}
        </div>
      </div>
    </>
  );
}
