'use client';

import { districtsOf, provinceCentre } from './provinces';
import styles from './register.module.css';

/** Where the map should go when the il or ilçe changes; `key` changes with them. */
export type MapFocus = { lat: number; lng: number; zoom: number; key: string };

/** The ilçe's point when one is chosen, else the il's centre. */
export function focusFor(city: string, district: string): MapFocus | null {
  const d = districtsOf(city).find((x) => x.name === district);
  if (d) return { lat: d.lat, lng: d.lng, zoom: 13, key: `${city}|${d.name}` };
  const c = provinceCentre(city);
  return c ? { lat: c.lat, lng: c.lng, zoom: 10, key: city } : null;
}

/** İlçe from the chosen il's list; a value saved before the list existed stays selectable. */
export function DistrictSelect(props: { id: string; city: string; value: string; onChange: (district: string) => void }) {
  const options = districtsOf(props.city).map((d) => d.name);
  const legacy = props.value && !options.includes(props.value) ? props.value : null;
  return (
    <select id={props.id} className={`input ${styles.select}`} value={props.value} disabled={!props.city} onChange={(e) => props.onChange(e.target.value)}>
      <option value="">{props.city ? 'Seçin' : 'Önce il seçin'}</option>
      {legacy && <option value={legacy}>{legacy}</option>}
      {options.map((d) => (
        <option key={d}>{d}</option>
      ))}
    </select>
  );
}
