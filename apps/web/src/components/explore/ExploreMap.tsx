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
import { useBusinessMode } from '@/lib/session';
import { shopHref } from '@/lib/views';
import { AUDIENCE, distanceMeters, formatDistance, photoUrl, placeLabel } from '@/lib/shop';
import type { NearbyShop } from '@/lib/types';
import styles from './ExploreMap.module.css';
import { ShareShop } from '@/components/ShareShop';
import { VerifiedTick } from '@/components/VerifiedTick';
import { FORWARD } from '@/lib/motion';
import { SkeletonList } from '@/components/Skeleton';
import { formatRating, RatingBadge, STAR } from '@/components/Stars';
import { mapStyleUrl } from '@/lib/theme';

/** Before the customer shares their location, the map opens on Kadıköy, İstanbul. */
const KADIKOY = { lat: 40.9905, lng: 29.029 };
/** Free vector map tiles, no key needed; a paid provider can replace this at launch. */

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
  const sheetDrag = useSheetDrag(sheetOpen, setSheetOpen);

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
        style: mapStyleUrl(),
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
    return shops.map((s) => ({ ...s, distance_m: Math.round(distanceMeters(user, { lat: s.latitude, lng: s.longitude })) })).sort((a, b) => a.distance_m - b.distance_m);
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
        setPinLabel(marker.getElement(), shop.name, shop.rating ?? null, formatDistance(shop.distance_m));
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

      <button type="button" className={styles.locateButton} onClick={() => (home ? goHome() : locate())} aria-label={home ? 'Salonuma git' : 'Konumuma git'} disabled={locating}>
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
          {/* One location prompt for customers (review, 12 November 2026): the banner in the list
              until they share it, and the round button; the pill is only the salon's "Salonum". */}
          {home ? (
            <button type="button" className={styles.locationPill} onClick={goHome}>
              <span className={styles.pillLogo} dangerouslySetInnerHTML={{ __html: logoGlyphSvg(15) }} />
              Salonum
            </button>
          ) : null}
        </div>

        <section
          ref={sheetDrag.ref}
          className={`${styles.sheet} ${sheetOpen ? styles.sheetOpen : ''} ${sheetDrag.height !== null ? styles.sheetDragging : ''}`}
          style={sheetDrag.height !== null ? { height: sheetDrag.height } : undefined}
          aria-labelledby="nearby-title"
        >
          <div className={styles.grab} {...sheetDrag.handlers}>
            <button type="button" className={styles.handle} onClick={sheetDrag.onHandleClick} aria-expanded={sheetOpen}>
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
          </div>
          {!user && !business && (
            <div className={styles.locationHint}>
              <span>Size en yakın kuaförleri görmek için konumunuzu paylaşın.</span>
              <button type="button" className="btn btn-primary" onClick={() => locate()} disabled={locating}>
                Konumumu kullan
              </button>
            </div>
          )}
          {locationError && <p className="alert alert-danger">{locationError}</p>}
          {!listed && <SkeletonList rows={3} label="Kuaförler yükleniyor" />}
          <ul className={styles.list} role="list">
            {(listed ?? []).map((shop) => (
              <li key={shop.slug} id={`shop-${shop.slug}`} className="motion-fade">
                <Link
                  transitionTypes={FORWARD}
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
                    <span className={styles.itemName}>
                      {shop.name}
                      {shop.verified && <VerifiedTick kind="salon" />}
                    </span>
                    <span className={styles.itemMeta}>
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

/**
 * The chosen pin's label: the salon's name, and below it the rating with a star
 * (founder, 8 November 2026) and the distance. Built with textContent: names are typed by salons.
 */
function setPinLabel(pin: HTMLElement, name: string, rating: number | null, distance: string) {
  const key = `${name}|${rating}|${distance}`;
  if (pin.dataset.labelKey === key) return;
  pin.dataset.labelKey = key;
  pin.querySelector(`.${styles.pinLabel}`)?.remove();
  const label = document.createElement('span');
  label.className = styles.pinLabel;
  label.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = name;
  const line = document.createElement('span');
  if (rating != null) {
    const value = document.createElement('b');
    value.textContent = formatRating(rating);
    line.append(value);
    line.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 24 24" width="12" height="12"><path d="${STAR}" /></svg>`);
    line.append(' · ');
  }
  line.append(distance);
  label.append(title, line);
  pin.append(label);
}

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
          <span className={styles.itemName}>
            {shop.name}
            {shop.verified && <VerifiedTick kind="salon" />}
          </span>
          <span className={styles.itemMeta}>
            {AUDIENCE[shop.audience]}
            {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
          </span>
        </span>
      </div>
      <div className={styles.myShopActions}>
        {shop.reviewed_at && shop.visible ? (
          <Link transitionTypes={FORWARD} href={`/${shop.slug}`} className="btn btn-primary">
            Müşteri gözüyle gör
          </Link>
        ) : (
          <span className={styles.myShopPending}>{shop.reviewed_at ? 'Salonunuz abonelik başlayana kadar müşterilere görünmüyor.' : 'Salon sayfanız onaydan sonra açılır.'}</span>
        )}
        {shop.reviewed_at && shop.visible && <ShareShop shop={shop} onDone={setNote} />}
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
 * Drag the list sheet up and down by its top part (v1.7), as in map apps: it
 * follows the finger, then settles open or closed by where it was let go, or by
 * the direction of a quick flick. A tap on the arrow still toggles, and links
 * and buttons in the top part keep working. Off on big screens, where the list
 * is a fixed column.
 */
function useSheetDrag(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const drag = useRef<{ id: number; startY: number; startH: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      const sheet = ref.current;
      if (!sheet || e.button !== 0 || getComputedStyle(sheet).position === 'static') return;
      const target = e.target as HTMLElement;
      if (target.closest('a, input, select, textarea') || (target.closest('button') && !target.closest('[aria-expanded]'))) return;
      dragged.current = false;
      drag.current = { id: e.pointerId, startY: e.clientY, startH: sheet.getBoundingClientRect().height, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.startY;
      if (!d.moved) {
        if (Math.abs(dy) < 6) return;
        d.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      d.v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      const vh = window.innerHeight;
      setHeight(Math.min(vh * 0.9, Math.max(vh * 0.14, d.startH - dy)));
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d || !d.moved) return;
      dragged.current = true;
      const vh = window.innerHeight;
      const h = d.startH - (e.clientY - d.startY);
      // A flick (faster than ~0.4 px/ms) decides by direction; otherwise the nearer state wins.
      setOpen(Math.abs(d.v) > 0.4 ? d.v < 0 : h > vh * 0.53);
      setHeight(null);
    },
    onPointerCancel() {
      drag.current = null;
      setHeight(null);
    },
  };

  // After a drag the browser may still send a click to the arrow: ignore that one.
  const onHandleClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setOpen(!open);
  };

  return { ref, height, handlers, onHandleClick };
}
