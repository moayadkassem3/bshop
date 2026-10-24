'use client';

import { useEffect, useState } from 'react';
import { isFavorite, setFavorite } from '@/lib/favorites';
import styles from './FavoriteButton.module.css';

/** Heart toggle that saves a shop to "Salonlarım". */
export function FavoriteButton({ slug, label = false }: { slug: string; label?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isFavorite(slug)
      .then(setOn)
      .catch(() => setOn(false));
  }, [slug]);

  async function toggle() {
    if (on === null) return;
    setBusy(true);
    const next = !on;
    setOn(next);
    try {
      await setFavorite(slug, next);
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  const text = on ? 'Favorilerimde' : 'Favorilere ekle';
  return (
    <button
      type="button"
      className={`${styles.button} ${on ? styles.on : ''} ${label ? styles.withLabel : ''}`}
      onClick={toggle}
      disabled={busy || on === null}
      aria-pressed={Boolean(on)}
      aria-label={label ? undefined : text}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path
          d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.7 3.1 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span>{text}</span>}
    </button>
  );
}
