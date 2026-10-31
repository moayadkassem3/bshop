'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadMyShops, onFavoritesChanged } from '@/lib/favorites';
import { formatLongDate } from '@/lib/format';
import { photoUrl, placeLabel } from '@/lib/shop';
import type { MyShop } from '@/lib/types';
import styles from './MyShops.module.css';
import { VerifiedTick } from './VerifiedTick';

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
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.2 1.1 3.9 2.2.4.6 1 .6 1.4 0C12.4 6.1 13.6 5 15.6 5 19 5 20.7 8.4 19.2 11.4 17 15.6 12 20 12 20z" />
          </svg>
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
                <span className={styles.name}>
                  {shop.name}
                  {shop.verified && <VerifiedTick kind="salon" size={14} />}
                </span>
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
