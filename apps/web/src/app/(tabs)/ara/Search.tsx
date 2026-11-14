'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PopularStrip } from '@/components/haircuts/PopularStrip';
import { Icon } from '@/components/Icon';
import { SkeletonList } from '@/components/Skeleton';
import { RatingBadge } from '@/components/Stars';
import { VerifiedTick } from '@/components/VerifiedTick';
import { api } from '@/lib/api';
import { useAudience } from '@/lib/audience';
import { useBusinessShops } from '@/lib/business';
import { loadMyShops, onFavoritesChanged } from '@/lib/favorites';
import { lastLocation, type LatLng } from '@/lib/location';
import { FORWARD, TAB } from '@/lib/motion';
import { useBusinessMode } from '@/lib/session';
import { AUDIENCE, formatDistance, photoUrl, placeLabel } from '@/lib/shop';
import type { MyShop, NearbyShop, ShopSummary } from '@/lib/types';
import styles from './search.module.css';

/** Where Keşfet's map opens before the customer shares their location. */
const KADIKOY = { lat: 40.9905, lng: 29.029 };

type Found = Omit<NearbyShop, 'latitude' | 'longitude' | 'distance_m'> & { distance_m?: number };

/**
 * The search screen (founder, 12 November 2026): opens when Keşfet's search bar is tapped.
 * Before anything is typed it shows Popüler kesimler for the customer's gender, their
 * favourite salons and the salons nearby; while typing, the salons that match (by name,
 * service, district or city), nearest first.
 */
export function Search() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [audience] = useAudience();
  const business = useBusinessMode();
  const { shop: myShop } = useBusinessShops(business);
  const [here, setHere] = useState<{ point: LatLng; known: boolean } | null>(null);
  const [nearby, setNearby] = useState<NearbyShop[] | null>(null);
  const [favorites, setFavorites] = useState<MyShop[]>([]);
  const [results, setResults] = useState<Found[] | null>(null);
  const text = query.trim();
  const searching = text.length >= 2;

  // Coming back from a salon's page, the search is as it was left.
  useEffect(() => {
    const kept = new URLSearchParams(window.location.search).get('q');
    if (kept) setQuery(kept);
    input.current?.focus();
  }, []);
  useEffect(() => {
    window.history.replaceState(null, '', text ? `/ara?q=${encodeURIComponent(text)}` : '/ara');
  }, [text]);

  // Measured from the salon in business mode, else from where the customer was last, else Kadıköy.
  const home = business && myShop?.latitude != null && myShop.longitude != null ? { lat: myShop.latitude, lng: myShop.longitude } : null;
  useEffect(() => {
    if (home) return setHere({ point: home, known: true });
    const last = lastLocation();
    setHere({ point: last ?? KADIKOY, known: Boolean(last) });
    // Coordinates, not the object: it is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home?.lat, home?.lng]);

  useEffect(() => {
    const load = () =>
      loadMyShops()
        .then((shops) => setFavorites(shops.filter((s) => s.favorite)))
        .catch(() => setFavorites([]));
    load();
    return onFavoritesChanged(load);
  }, []);

  useEffect(() => {
    if (!here) return;
    const params = new URLSearchParams({ lat: String(here.point.lat), lng: String(here.point.lng), radiusKm: '30', limit: '8' });
    if (audience !== 'all') params.set('audience', audience);
    api<NearbyShop[]>(`/public/nearby?${params}`)
      .then(setNearby)
      .catch(() => setNearby([]));
  }, [here, audience]);

  // While typing: salons within reach first (they have a distance), then the rest of Türkiye.
  useEffect(() => {
    if (!searching || !here) return setResults(null);
    let stale = false;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ lat: String(here.point.lat), lng: String(here.point.lng), radiusKm: '100', limit: '30', q: text });
      const [near, anywhere] = await Promise.all([
        api<NearbyShop[]>(`/public/nearby?${params}`).catch(() => [] as NearbyShop[]),
        api<ShopSummary[]>(`/public/search?q=${encodeURIComponent(text)}`).catch(() => [] as ShopSummary[]),
      ]);
      if (stale) return;
      const listed = new Set(near.map((s) => s.slug));
      setResults([...near, ...anywhere.filter((s) => !listed.has(s.slug))]);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searching, text, here]);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={`container narrow ${styles.barRow}`}>
          <Link href="/" transitionTypes={TAB} className={styles.back} aria-label="Geri">
            <Icon name="back" size={22} />
          </Link>
          <div className={styles.field}>
            <Icon name="search" size={20} />
            <input
              ref={input}
              className={styles.input}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Kuaför ya da hizmet ara"
              aria-label="Kuaför ya da hizmet ara"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className={styles.clear}
                aria-label="Aramayı temizle"
                onClick={() => {
                  setQuery('');
                  input.current?.focus();
                }}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={`container narrow ${styles.body}`}>
        {searching ? (
          <section aria-live="polite">
            <h2 className={styles.title}>Sonuçlar</h2>
            {!results && <SkeletonList rows={3} label="Aranıyor" />}
            {results && results.length === 0 && <p className={styles.none}>“{text}” ile eşleşen kuaför bulunamadı. Salon adını, hizmeti ya da ilçeyi yazmayı deneyin.</p>}
            {results && results.length > 0 && <Rows shops={results} />}
          </section>
        ) : (
          <>
            <div className={styles.popular}>
              <PopularStrip />
            </div>
            {favorites.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.title}>Favorilerim</h2>
                <div className={styles.slider}>
                  {favorites.map((shop) => (
                    <Link key={shop.slug} href={`/${shop.slug}`} transitionTypes={FORWARD} className={`card ${styles.tile}`}>
                      {shop.cover_photo_id ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl(shop.cover_photo_id)} alt="" className={styles.tilePhoto} loading="lazy" />
                      ) : (
                        <span className={styles.tilePhoto} aria-hidden />
                      )}
                      <span className={styles.tileText}>
                        <span className={styles.name}>
                          {shop.name}
                          {shop.verified && <VerifiedTick kind="salon" size={13} />}
                        </span>
                        <span className={styles.meta}>
                          {shop.rating != null ? <RatingBadge rating={shop.rating} count={shop.rating_count} /> : (placeLabel(shop) ?? AUDIENCE[shop.audience as keyof typeof AUDIENCE] ?? 'Kuaför')}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section className={styles.section}>
              <h2 className={styles.title}>{home ? 'Salonunuzun yakınındaki kuaförler' : here && !here.known ? 'Kadıköy çevresindeki kuaförler' : 'Yakınınızdaki kuaförler'}</h2>
              {!nearby && <SkeletonList rows={3} label="Kuaförler yükleniyor" />}
              {nearby && nearby.length === 0 && <p className={styles.none}>Yakınınızda henüz kuaför yok. Salon adını ya da şehri yazarak arayabilirsiniz.</p>}
              {nearby && nearby.length > 0 && <Rows shops={nearby} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Rows({ shops }: { shops: Found[] }) {
  return (
    <ul className={styles.list} role="list">
      {shops.map((shop) => (
        <li key={shop.slug}>
          <Link href={`/${shop.slug}`} transitionTypes={FORWARD} className={`card ${styles.row} motion-fade`}>
            {shop.cover_photo_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl(shop.cover_photo_id)} alt="" className={styles.rowPhoto} width={64} height={64} loading="lazy" />
            ) : (
              <span className={styles.rowPhoto} aria-hidden />
            )}
            <span className={styles.rowText}>
              <span className={styles.name}>
                {shop.name}
                {shop.verified && <VerifiedTick kind="salon" size={14} />}
              </span>
              <span className={styles.meta}>
                {shop.rating != null && (
                  <>
                    <RatingBadge rating={shop.rating} count={shop.rating_count} />
                    {' · '}
                  </>
                )}
                {AUDIENCE[shop.audience as keyof typeof AUDIENCE] ?? 'Kuaför'}
                {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
              </span>
            </span>
            {shop.distance_m != null && <span className={styles.distance}>{formatDistance(shop.distance_m)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
