'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import styles from './register.module.css';

const KADIKOY = { lat: 40.9905, lng: 29.029 };

import type { MapFocus } from './places';

type Point = { lat: number; lng: number };

/**
 * Tap the map or drag the pin to where the salon is; "Konumumu kullan" works
 * best from inside the salon. Choosing an il or ilçe (`focus`) takes the map and
 * the pin there, and the exact spot is then confirmed by hand.
 */
export function LocationPicker(props: { value: Point | null; onChange: (point: Point | null) => void; focus?: MapFocus | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusKey = useRef(props.focus?.key);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const start = props.value ?? props.focus ?? KADIKOY;
      const map = new maplibre.Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [start.lng, start.lat],
        zoom: props.value ? 16 : (props.focus?.zoom ?? 13),
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      const pin = document.createElement('div');
      pin.className = styles.pin;
      marker.current = new maplibre.Marker({ element: pin, draggable: true, anchor: 'bottom' })
        .setLngLat([start.lng, start.lat])
        .addTo(map);
      // A faded pin is only a suggestion; it turns solid once the spot is set.
      if (!props.value) marker.current.setOpacity(0.45);
      const set = (lng: number, lat: number) => {
        marker.current?.setLngLat([lng, lat]);
        marker.current?.setOpacity(1);
        onChange.current({ lat, lng });
      };
      marker.current.on('dragend', () => {
        const p = marker.current!.getLngLat();
        set(p.lng, p.lat);
      });
      map.on('click', (e) => set(e.lngLat.lng, e.lngLat.lat));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later changes come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new il or ilçe: the map and the pin travel there, and the old spot no longer counts.
  const focus = props.focus;
  useEffect(() => {
    if (!focus || focus.key === focusKey.current) return;
    focusKey.current = focus.key;
    marker.current?.setLngLat([focus.lng, focus.lat]);
    marker.current?.setOpacity(0.45);
    mapRef.current?.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, maxDuration: 1500 });
    onChange.current(null);
  }, [focus]);

  function locate() {
    if (!navigator.geolocation) return setError('Tarayıcınız konum paylaşmayı desteklemiyor.');
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        marker.current?.setLngLat([point.lng, point.lat]);
        marker.current?.setOpacity(1);
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 17 });
        props.onChange(point);
      },
      () => {
        setLocating(false);
        setError('Konumunuza erişilemedi. Haritada salonunuzun yerine dokunun.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={styles.pickerWrap}>
      <div ref={container} className={styles.picker} aria-label="Salonun konumu" />
      <button type="button" className={`btn ${styles.pickerLocate}`} onClick={locate} disabled={locating}>
        ◎ {locating ? 'Konum alınıyor…' : 'Konumumu kullan'}
      </button>
      <p className={styles.pickerHint}>
        {props.value
          ? '✓ Konum işaretlendi. Gerekirse iğneyi sürükleyin.'
          : props.focus
            ? 'İğneyi salonunuzun tam yerine sürükleyin ya da haritada oraya dokunun.'
            : 'Haritada salonunuzun yerine dokunun ya da salondaysanız “Konumumu kullan”a basın.'}
      </p>
      {error && <p className="alert alert-danger">{error}</p>}
    </div>
  );
}
