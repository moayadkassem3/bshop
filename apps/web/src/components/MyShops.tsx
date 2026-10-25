'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadMyShops, onFavoritesChanged } from '@/lib/favorites';
import { formatLongDate } from '@/lib/format';
import { photoUrl, placeLabel } from '@/lib/shop';
import type { MyShop } from '@/lib/types';
import styles from './MyShops.module.css';

/** Favoriler tab: favourite shops, then shops booked before, each one tap from booking. */
export function MyShops() {
  const [shops, setShops] = useState<MyShop[] | null>(null);

  useEffect(() => {
    const load = () =>
      loadMyShops()
        .then(setShops)
        .catch(() => setShops([]));
    load();
    return onFavoritesChanged(load);
  }, []);

  if (!shops) return null;
  if (!shops.length) {
    return (
      <div className={`card ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden>
          ♥
        </span>
        <h2>Henüz favori kuaförünüz yok</h2>
        <p className="muted">Bir kuaförün sayfasındaki kalbe dokunun; burada hep elinizin altında olsun.</p>
        <Link href="/" className="btn btn-primary">
          Kuaför keşfet
        </Link>
      </div>
    );
  }

  const favorites = shops.filter((s) => s.favorite);
  const visited = shops.filter((s) => !s.favorite);
  return (
    <>
      {favorites.length > 0 && <Group title="Favorilerim" shops={favorites} />}
      {visited.length > 0 && <Group title="Daha önce gittiklerim" shops={visited} />}
    </>
  );
}

function Group({ title, shops }: { title: string; shops: MyShop[] }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{title}</h2>
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
                {placeLabel(shop) && <span className={styles.meta}>{placeLabel(shop)}</span>}
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
