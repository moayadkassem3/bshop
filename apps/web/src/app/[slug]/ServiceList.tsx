'use client';

import { useState } from 'react';
import styles from './shop.module.css';

type Row = { id: string; name: string; meta: string; price: string };
const VISIBLE = 6;

/** The shop's price list; long lists open with "Tümünü göster". */
export function ServiceList({ services }: { services: Row[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? services : services.slice(0, VISIBLE);
  return (
    <>
      <ul className={styles.priceList} role="list">
        {shown.map((s) => (
          <li key={s.id}>
            <span>
              <span className={styles.priceName}>{s.name}</span>
              <span className={styles.priceMeta}>{s.meta}</span>
            </span>
            <span className={styles.price}>{s.price}</span>
          </li>
        ))}
      </ul>
      {services.length > VISIBLE && (
        <button type="button" className={styles.showAll} onClick={() => setAll((v) => !v)}>
          {all ? 'Daha az göster' : `Tümünü göster (${services.length})`}
        </button>
      )}
    </>
  );
}
