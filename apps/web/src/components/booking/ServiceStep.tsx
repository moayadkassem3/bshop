'use client';

import { useState } from 'react';
import { formatDuration, formatPrice } from '@/lib/format';
import type { Service } from '@/lib/types';
import styles from './booking.module.css';

export function ServiceStep(props: { services: Service[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('tr');
  const visible = props.services.filter((s) => !q || s.name.toLocaleLowerCase('tr').includes(q));

  function toggle(id: string) {
    props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);
  }

  return (
    <section aria-labelledby="services-title">
      <h2 id="services-title" className={styles.stepTitle}>
        Hizmet seçin
      </h2>
      <p className={styles.stepHint}>Birden fazla hizmet seçebilirsiniz; aynı personel sırayla yapar.</p>
      {props.services.length > 6 && (
        <input
          className="input"
          placeholder="Hizmet ara"
          aria-label="Hizmet ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <ul className={styles.list} role="list">
        {visible.map((s) => {
          const checked = props.selected.includes(s.id);
          return (
            <li key={s.id}>
              <label className={`${styles.option} ${checked ? styles.optionSelected : ''}`}>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(s.id)} />
                <span className={styles.optionBody}>
                  <span className={styles.optionName}>{s.name}</span>
                  <span className={styles.optionMeta}>{formatDuration(s.duration_minutes)}</span>
                </span>
                <span className={styles.optionPrice}>{formatPrice(s.price_kurus, s.price_is_starting_from)}</span>
                <span className={styles.check} aria-hidden>
                  {checked ? '✓' : ''}
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="muted">Aramayla eşleşen hizmet yok.</li>}
      </ul>
    </section>
  );
}
