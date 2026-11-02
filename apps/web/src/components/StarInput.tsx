'use client';

import { useState } from 'react';
import { STAR } from './Stars';
import styles from './Stars.module.css';

/** Tap a star to rate (1–5). Big targets, one tap, no submit button. */
export function StarInput({ value, onChange, disabled }: { value: number | null; onChange: (stars: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <span className={styles.input} role="radiogroup" aria-label="Puanınız" onPointerLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} yıldız`}
          disabled={disabled}
          className={i <= shown ? styles.on : styles.off}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
          onClick={() => onChange(i)}
        >
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
            <path d={STAR} />
          </svg>
        </button>
      ))}
    </span>
  );
}
