'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { lastLocation, locationPermissionGranted, rememberLocation, type LatLng } from '@/lib/location';
import { PopularStrip } from '@/components/haircuts/PopularStrip';
import { useAudience } from '@/lib/audience';
import { AUDIENCE, distanceMeters, formatDistance, photoUrl, placeLabel } from '@/lib/shop';
import type { NearbyShop } from '@/lib/types';
import styles from './ExploreMap.module.css';

/** Before the customer shares their location, the map opens on Kadıköy, İstanbul. */
const KADIKOY = { lat: 40.9905, lng: 29.029 };
/** Free vector map tiles, no key needed; a paid provider can replace this at launch. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export function ExploreMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const userMarker = useRef<Marker | null>(null);
  const [center, setCenter] = useState<LatLng>(KADIKOY);
  const [user, setUser] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [audience, pickAudience] = useAudience();
  const [shops, setShops] = useState<NearbyShop[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      // Someone who shared their location before starts where they were last time.
      const last = lastLocation();
      const start = last ?? KADIKOY;
      const map = new maplibre.Map({
        container: container.current,
        style: MAP_STYLE,
        center: [start.lng, start.lat],
        zoom: last ? 15 : 14,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      // Centre within the visible part of the map: below the search bar, above the list.
      map.setPadding({ top: 150, bottom: Math.round(window.innerHeight * 0.34), left: 0, right: 0 });
      map.on('moveend', () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      if (last) {
        setCenter(last);
        showUser(last, false);
        // Refresh it quietly when the browser already allows it; never prompt on page load.
        if (await locationPermissionGranted()) locate({ quiet: true });
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.current.clear();
    };
  }, []);

  // Shops around the map's centre, filtered by the search text and salon type.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), radiusKm: '30' });
      if (query.trim().length >= 2) params.set('q', query.trim());
      if (audience !== 'all') params.set('audience', audience);
      api<NearbyShop[]>(`/public/nearby?${params}`)
        .then(setShops)
        .catch(() => setShops([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [center, query, audience]);

  // Nearest first: from the customer when we know where they are, otherwise from the map's centre.
  const sorted = useMemo(() => {
    if (!shops) return null;
    if (!user) return shops;
    return shops
      .map((s) => ({ ...s, distance_m: Math.round(distanceMeters(user, { lat: s.latitude, lng: s.longitude })) }))
      .sort((a, b) => a.distance_m - b.distance_m);
  }, [shops, user]);

  // Tapping a pin highlights the shop in the list without covering the map.
  const select = useCallback((slug: string) => {
    setSelected(slug);
    document.getElementById(`shop-${slug}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  // Keep one pin per shop on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sorted) return;
    (async () => {
      const maplibre = await import('maplibre-gl');
      const wanted = new Set(sorted.map((s) => s.slug));
      for (const [slug, marker] of markers.current) {
        if (!wanted.has(slug)) {
          marker.remove();
          markers.current.delete(slug);
        }
      }
      for (const shop of sorted) {
        let marker = markers.current.get(shop.slug);
        if (!marker) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = styles.pin;
          el.setAttribute('aria-label', shop.name);
          el.innerHTML = PIN_ICON;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            select(shop.slug);
          });
          marker = new maplibre.Marker({ element: el, anchor: 'bottom' }).setLngLat([shop.longitude, shop.latitude]).addTo(map);
          markers.current.set(shop.slug, marker);
        }
        marker.getElement().classList.toggle(styles.pinSelected, shop.slug === selected);
        marker.getElement().dataset.label = `${shop.name} · ${formatDistance(shop.distance_m)}`;
      }
    })();
  }, [sorted, selected, select]);

  async function showUser(here: LatLng, fly: boolean) {
    setUser(here);
    const map = mapRef.current;
    if (!map) return;
    const maplibre = await import('maplibre-gl');
    if (!userMarker.current) {
      const dot = document.createElement('span');
      dot.className = styles.userDot;
      userMarker.current = new maplibre.Marker({ element: dot }).setLngLat([here.lng, here.lat]).addTo(map);
    } else userMarker.current.setLngLat([here.lng, here.lat]);
    if (fly) map.flyTo({ center: [here.lng, here.lat], zoom: 15 });
  }

  function locate({ quiet = false } = {}) {
    if (!navigator.geolocation) {
      if (!quiet) setLocationError('Tarayıcınız konum paylaşmayı desteklemiyor.');
      return;
    }
    if (!quiet) setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const before = lastLocation();
        setLocating(false);
        rememberLocation(here);
        // A quiet refresh only moves the map when the customer is somewhere new.
        showUser(here, !quiet || !before || distanceMeters(before, here) > 300);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) rememberLocation(null);
        if (!quiet) setLocationError('Konumunuza erişilemedi. Tarayıcı ayarlarından konum iznini açabilirsiniz.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={styles.page}>
      <div ref={container} className={styles.map} aria-label="Kuaför haritası" />

      <div className={styles.top}>
        <div className={styles.search}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Kuaför ya da hizmet ara"
            aria-label="Kuaför ya da hizmet ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSheetOpen(true)}
          />
        </div>
        <div className={styles.chips} role="radiogroup" aria-label="Salon türü">
          {(
            [
              ['all', 'Tümü'],
              ['men', 'Erkek kuaförü'],
              ['women', 'Kadın kuaförü'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={audience === value}
              className={`${styles.chip} ${audience === value ? styles.chipOn : ''}`}
              onClick={() => pickAudience(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.locationPill} onClick={() => locate()} disabled={locating}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m3 11 18-8-8 18-2-8z" />
          </svg>
          {user ? 'Mevcut konumum' : locating ? 'Konum alınıyor…' : 'Konumumu kullan'}
        </button>
      </div>

      <button type="button" className={styles.locateButton} onClick={() => locate()} aria-label="Konumuma git" disabled={locating}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      </button>

      <section className={`${styles.sheet} ${sheetOpen ? styles.sheetOpen : ''}`} aria-labelledby="nearby-title">
        <button type="button" className={styles.handle} onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
          <span className={styles.handleBar} aria-hidden />
          <span className="sr-only">{sheetOpen ? 'Listeyi küçült' : 'Listeyi büyüt'}</span>
        </button>
        <h1 id="nearby-title" className={styles.sheetTitle}>
          Yakındaki kuaförler
        </h1>
        <p className={styles.sheetMeta}>
          {sorted ? (
            <>
              {user ? 'Yakınınızda' : 'Bu bölgede'} <strong>{sorted.length} kuaför</strong> · en yakından uzağa
            </>
          ) : (
            'Kuaförler yükleniyor…'
          )}
        </p>
        {!user && (
          <div className={styles.locationHint}>
            <span>Size en yakın kuaförleri görmek için konumunuzu paylaşın.</span>
            <button type="button" className="btn btn-primary" onClick={() => locate()} disabled={locating}>
              Konumumu kullan
            </button>
          </div>
        )}
        {locationError && <p className="alert alert-danger">{locationError}</p>}
        <PopularStrip audience={audience} />
        <ul className={styles.list} role="list">
          {(sorted ?? []).map((shop) => (
            <li key={shop.slug} id={`shop-${shop.slug}`}>
              <Link
                href={`/${shop.slug}`}
                className={`${styles.item} ${shop.slug === selected ? styles.itemSelected : ''}`}
                onMouseEnter={() => setSelected(shop.slug)}
              >
                {shop.cover_photo_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(shop.cover_photo_id)} alt="" className={styles.thumb} width={56} height={56} />
                ) : (
                  <span className={`${styles.thumb} ${styles.initial}`} aria-hidden>
                    {shop.name[0]}
                  </span>
                )}
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{shop.name}</span>
                  <span className={styles.itemMeta}>
                    {AUDIENCE[shop.audience as keyof typeof AUDIENCE] ?? 'Kuaför'}
                    {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
                  </span>
                </span>
                <span className={styles.distance}>{formatDistance(shop.distance_m)}</span>
              </Link>
            </li>
          ))}
          {sorted && sorted.length === 0 && (
            <li className={styles.empty}>Bu bölgede aramanızla eşleşen kuaför bulunamadı. Haritayı kaydırmayı deneyin.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

const PIN_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></svg>`;
