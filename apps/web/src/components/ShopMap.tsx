'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ShopSummary } from '@/lib/types';
import styles from './ShopMap.module.css';

const ISTANBUL: [number, number] = [41.015, 28.979];

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Map discovery (handoff 4.2): only reviewed, subscribed shops are returned by the API. */
export function ShopMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [shops, setShops] = useState<ShopSummary[] | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Leaflet needs the browser, so it loads after the page renders.
      const L = (await import('leaflet')).default;
      if (cancelled || !container.current) return;
      const map = L.map(container.current).setView(ISTANBUL, 13);
      mapRef.current = map;
      // OpenStreetMap tiles for development; production needs a commercial tile provider (milestone 4).
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      const pins = L.layerGroup().addTo(map);
      const icon = L.divIcon({ className: styles.pin, html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 30] });

      const load = async () => {
        const b = map.getBounds();
        const query = `minLat=${b.getSouth()}&maxLat=${b.getNorth()}&minLng=${b.getWest()}&maxLng=${b.getEast()}`;
        const list = await api<ShopSummary[]>(`/public/shops?${query}`).catch(() => []);
        if (cancelled) return;
        pins.clearLayers();
        for (const s of list) {
          if (s.latitude === null || s.longitude === null) continue;
          L.marker([s.latitude, s.longitude], { icon })
            .bindPopup(
              `<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.address ?? '')}<br><a href="/${encodeURIComponent(s.slug)}">Randevu al →</a>`,
            )
            .addTo(pins);
        }
        setShops(list);
      };
      map.on('moveend', load);
      await load();
      // Fit the pilot shops on first load, so the map never opens empty.
      const first = await api<ShopSummary[]>('/public/shops?minLat=40.8&maxLat=41.4&minLng=28.4&maxLng=29.5').catch(() => []);
      const points = first.filter((s) => s.latitude !== null).map((s) => [s.latitude!, s.longitude!] as [number, number]);
      if (!cancelled && points.length) map.fitBounds(points, { padding: [48, 48], maxZoom: 15 });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10_000 },
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.mapBox}>
        <div ref={container} className={styles.map} aria-label="Salon haritası" />
        <button type="button" className={`btn ${styles.locate}`} onClick={locate} disabled={locating}>
          ◎ Konumumu kullan
        </button>
      </div>
      <h2 className={styles.listTitle}>{shops ? `Bu bölgede ${shops.length} salon` : 'Salonlar yükleniyor…'}</h2>
      <ul className={styles.list} role="list">
        {(shops ?? []).map((s) => (
          <li key={s.slug}>
            <Link href={`/${s.slug}`} className={`card ${styles.item}`}>
              <span>
                <strong>{s.name}</strong>
                {s.address && <span className={styles.address}>{s.address}</span>}
              </span>
              <span className={styles.go}>Randevu al →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
