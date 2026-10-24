'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { photoUrl } from '@/lib/shop';
import type { ShopSummary } from '@/lib/types';
import styles from './SearchBox.module.css';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShopSummary[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      api<ShopSummary[]>(`/public/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className={styles.wrap}>
      <label htmlFor="shop-search" className="sr-only">
        Salon ara
      </label>
      <div className={styles.box}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="shop-search"
          className={styles.input}
          placeholder="Salon adı veya semt yazın"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      {results && (
        <ul className={styles.results} role="list">
          {results.length === 0 && <li className={styles.empty}>Bu aramayla eşleşen salon bulunamadı.</li>}
          {results.map((shop) => (
            <li key={shop.slug}>
              <Link href={`/${shop.slug}`} className={styles.result}>
                {shop.cover_photo_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(shop.cover_photo_id)} alt="" className={styles.thumb} width={56} height={56} />
                ) : (
                  <span className={styles.thumb} aria-hidden />
                )}
                <span className={styles.resultText}>
                  <span className={styles.resultName}>{shop.name}</span>
                  <span className={styles.resultAddress}>{shop.district ?? shop.address}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
