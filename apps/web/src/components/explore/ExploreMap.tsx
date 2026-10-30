'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { lastLocation, locationPermissionGranted, rememberLocation, type LatLng } from '@/lib/location';
import { logoGlyphSvg } from '@/lib/logo';
import { useAudience } from '@/lib/audience';
import { useBusinessShops, type BusinessShop } from '@/lib/business';
import { BRAND } from '@/lib/config';
import { qrPosterPng, saveFile } from '@/lib/qr';
import { useBusinessMode } from '@/lib/session';
import { qrLink, shopHref } from '@/lib/views';
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

  // Business mode (v1.7): the map stays on the salon instead of the phone's location, and
  // the sheet opens with the salon's own card; nearby salons are measured from the salon.
  const business = useBusinessMode();
  const { shop: myShop } = useBusinessShops(business);
  const home = business && myShop?.latitude != null && myShop.longitude != null ? { lat: myShop.latitude, lng: myShop.longitude } : null;
  const businessRef = useRef(business);
  businessRef.current = business;
  const homeRef = useRef(home);
  homeRef.current = home;

  useEffect(() => {
    if (!home) return;
    userMarker.current?.remove();
    userMarker.current = null;
    setUser(home);
    setCenter(home);
    mapRef.current?.jumpTo({ center: [home.lng, home.lat], zoom: 15 });
    // Coordinates, not the object: it is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home?.lat, home?.lng]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      // Someone who shared their location before starts where they were last time.
      const last = lastLocation();
      const start = homeRef.current ?? last ?? KADIKOY;
      const map = new maplibre.Map({
        container: container.current,
        style: MAP_STYLE,
        center: [start.lng, start.lat],
        zoom: homeRef.current || last ? 15 : 14,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      // Centre within the visible part of the map: below the search bar, above the list.
      map.setPadding({ top: 150, bottom: Math.round(window.innerHeight * 0.34), left: 0, right: 0 });
      map.on('moveend', () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      if (last && !businessRef.current) {
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

  // Keep one pin per shop on the map; in business mode your own salon's pin is dark.
  const mineSlug = home ? myShop?.slug : undefined;
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
        marker.getElement().classList.toggle(styles.pinMine, shop.slug === mineSlug);
        marker.getElement().dataset.label = `${shop.name} · ${formatDistance(shop.distance_m)}`;
      }
    })();
  }, [sorted, selected, select, mineSlug]);

  async function showUser(here: LatLng, fly: boolean) {
    // In business mode the salon is the reference point, not the phone.
    if (businessRef.current) return;
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

  // In business mode the salon's own card is shown above, so the list holds the others.
  const listed = home && myShop ? (sorted?.filter((s) => s.slug !== myShop.slug) ?? null) : sorted;

  function goHome() {
    if (home) mapRef.current?.flyTo({ center: [home.lng, home.lat], zoom: 15 });
  }

  return (
    <div className={styles.page}>
      <div ref={container} className={styles.map} aria-label="Kuaför haritası" />

      <button
        type="button"
        className={styles.locateButton}
        onClick={() => (home ? goHome() : locate())}
        aria-label={home ? 'Salonuma git' : 'Konumuma git'}
        disabled={locating}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      </button>

      {/* Phones: these float on the map. Big screens: one panel on the left, the map beside it. */}
      <div className={styles.panel}>
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
          {home ? (
            <button type="button" className={styles.locationPill} onClick={goHome}>
              <span className={styles.pillLogo} dangerouslySetInnerHTML={{ __html: logoGlyphSvg(15) }} />
              Salonum
            </button>
          ) : (
            <button type="button" className={styles.locationPill} onClick={() => locate()} disabled={locating}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m3 11 18-8-8 18-2-8z" />
              </svg>
              {user ? 'Mevcut konumum' : locating ? 'Konum alınıyor…' : 'Konumumu kullan'}
            </button>
          )}
        </div>

        <section className={`${styles.sheet} ${sheetOpen ? styles.sheetOpen : ''}`} aria-labelledby="nearby-title">
          <button type="button" className={styles.handle} onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
            {/* A wide arrow: tap to open the list (points up) or close it (points down). */}
            <svg className={styles.handleArrow} viewBox="0 0 48 16" width="48" height="16" aria-hidden>
              <path d="M5 12 24 4l19 8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{sheetOpen ? 'Listeyi küçült' : 'Listeyi büyüt'}</span>
          </button>
          {home && myShop && <MyShopCard shop={myShop} />}
          <h1 id="nearby-title" className={home ? styles.sheetSubtitle : styles.sheetTitle}>
            {home ? 'Çevredeki salonlar' : 'Yakındaki kuaförler'}
          </h1>
          <p className={styles.sheetMeta}>
            {listed ? (
              <>
                {home ? 'Salonunuzun çevresinde' : user ? 'Yakınınızda' : 'Bu bölgede'} <strong>{listed.length} kuaför</strong> · en yakından uzağa
              </>
            ) : (
              'Kuaförler yükleniyor…'
            )}
          </p>
          {!user && !business && (
            <div className={styles.locationHint}>
              <span>Size en yakın kuaförleri görmek için konumunuzu paylaşın.</span>
              <button type="button" className="btn btn-primary" onClick={() => locate()} disabled={locating}>
                Konumumu kullan
              </button>
            </div>
          )}
          {locationError && <p className="alert alert-danger">{locationError}</p>}
          <ul className={styles.list} role="list">
            {(listed ?? []).map((shop) => (
              <li key={shop.slug} id={`shop-${shop.slug}`}>
                <Link
                  href={shopHref(shop.slug, 'kesfet')}
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
            {listed && listed.length === 0 && <li className={styles.empty}>Bu bölgede aramanızla eşleşen kuaför bulunamadı. Haritayı kaydırmayı deneyin.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

// The app logo's scissors, so every salon on the map carries the brand mark.
const PIN_ICON = logoGlyphSvg(22);

/** "Salonum" at the top of the sheet in business mode: the salon as customers see it, one tap away. */
function MyShopCard({ shop }: { shop: BusinessShop }) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className={styles.myShop}>
      <p className={styles.myShopLabel}>Salonum</p>
      <div className={styles.myShopRow}>
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
            {AUDIENCE[shop.audience]}
            {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
          </span>
        </span>
      </div>
      <div className={styles.myShopActions}>
        {shop.reviewed_at ? (
          <Link href={`/${shop.slug}`} className="btn btn-primary">
            Müşteri gözüyle gör
          </Link>
        ) : (
          <span className={styles.myShopPending}>Salon sayfanız onaydan sonra açılır.</span>
        )}
        {shop.reviewed_at && <ShareShop shop={shop} onDone={setNote} />}
      </div>
      {note && (
        <p className={styles.myShopNote} role="status">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * "Paylaş": the salon's QR poster and its link together, through the phone's
 * share menu (WhatsApp, Instagram, ...). Where files cannot be shared, the PNG
 * is downloaded and the link copied instead.
 */
function ShareShop({ shop, onDone }: { shop: BusinessShop; onDone: (note: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/${shop.slug}`;

  // Built ahead of the tap: browsers only open the share menu right after a user gesture.
  useEffect(() => {
    let cancelled = false;
    qrPosterPng(qrLink(link), `${shop.name} | ${BRAND}`)
      .then((png) => !cancelled && setFile(new File([png], `${shop.slug}-qr.png`, { type: 'image/png' })))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [link, shop.name, shop.slug]);

  async function share() {
    if (!file) return;
    onDone(null);
    const text = `${shop.name}: randevu almak için ${link}`;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: shop.name, text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    saveFile(file, file.name);
    try {
      await navigator.clipboard.writeText(link);
      onDone('QR kod indirildi, bağlantı kopyalandı.');
    } catch {
      onDone(`QR kod indirildi. Bağlantı: ${link}`);
    }
  }

  return (
    <button type="button" className={`btn ${styles.shareBtn}`} disabled={!file} onClick={share}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      Paylaş
    </button>
  );
}
