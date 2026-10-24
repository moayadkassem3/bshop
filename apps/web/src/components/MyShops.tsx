'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadMyShops, onFavoritesChanged } from '@/lib/favorites';
import { formatLongDate } from '@/lib/format';
import { photoUrl, placeLabel } from '@/lib/shop';
import type { MyShop } from '@/lib/types';
import styles from './MyShops.module.css';

/** "Salonlarım": the customer's own shops at the top of the home page, one tap from booking. */
export function MyShops() {
  const [shops, setShops] = useState<MyShop[]>([]);

  useEffect(() => {
    const load = () => loadMyShops().then(setShops).catch(() => undefined);
    load();
    return onFavoritesChanged(load);
  }, []);

  if (!shops.length) return null;
  return (
    <section className={styles.section} aria-labelledby="my-shops-title">
      <h2 id="my-shops-title" className={styles.title}>
        Salonlarım
      </h2>
      <ul className={styles.list} role="list">
        {shops.map((shop) => (
          <li key={shop.slug} className={`card ${styles.card}`}>
            <Link href={`/${shop.slug}`} className={styles.main}>
              {shop.cover_photo_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(shop.cover_photo_id)} alt="" className={styles.photo} width={64} height={64} />
              ) : (
                <span className={styles.photo} aria-hidden />
              )}
              <span className={styles.text}>
                <span className={styles.name}>{shop.name}</span>
                <span className={styles.meta}>
                  {shop.favorite ? '♥ Favori' : 'Daha önce gittiniz'}
                  {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
                </span>
                {shop.last_visit && <span className={styles.meta}>Son randevu: {formatLongDate(shop.last_visit)}</span>}
              </span>
            </Link>
            <Link href={`/${shop.slug}/randevu`} className={`btn btn-primary ${styles.book}`}>
              Randevu al
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
