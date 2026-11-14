import styles from './Stars.module.css';

export const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';

export const formatRating = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "★ 4,8 (23)" for lists and headers (v1.7); nothing until the salon has enough ratings. */
export function RatingBadge({ rating, count, size = 'small' }: { rating?: number | null; count?: number; size?: 'small' | 'large' }) {
  if (rating == null || !count) return null;
  return (
    <span className={`${styles.badge} ${size === 'large' ? styles.badgeLarge : ''}`} aria-label={`5 üzerinden ${formatRating(rating)}, ${count} değerlendirme`}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={STAR} />
      </svg>
      <strong>{formatRating(rating)}</strong>
      <span>({count})</span>
    </span>
  );
}

/** Five stars, `value` of them filled (whole stars). */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className={styles.row} role="img" aria-label={`5 üzerinden ${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} className={i <= value ? styles.on : styles.off} aria-hidden>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}
