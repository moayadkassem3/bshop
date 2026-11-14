import { formatRating, StarRow } from '@/components/Stars';
import type { RatingsSummary } from '@/lib/types';
import styles from './shop.module.css';

const day = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

/**
 * Değerlendirmeler on the salon page (v1.7): stars from customers of completed
 * visits, each customer counted once, with the salon's replies. The average and
 * the breakdown appear from the third customer.
 */
export function RatingsSection({ data }: { data: RatingsSummary }) {
  if (!data.count) return null;
  const max = Math.max(1, ...data.distribution);
  return (
    <section id="degerlendirmeler" className={`card ${styles.section}`} aria-labelledby="ratings-title">
      <h2 id="ratings-title" className={styles.sectionTitle}>
        Değerlendirmeler
      </h2>
      {data.rating != null ? (
        <div className={styles.ratingSummary}>
          <div className={styles.ratingBig}>
            <strong>{formatRating(data.rating)}</strong>
            <StarRow value={Math.round(data.rating)} size={18} />
            <span>{data.count} müşteri</span>
          </div>
          <ul className={styles.ratingBars} role="list" aria-label="Yıldız dağılımı">
            {data.distribution.map((n, i) => (
              <li key={i}>
                <span>{5 - i}</span>
                <span className={styles.ratingTrack}>{n > 0 && <span style={{ width: `${(n / max) * 100}%` }} />}</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.ratingFew}>Ortalama, 3 müşteri değerlendirdikten sonra gösterilir.</p>
      )}
      <ul className={styles.ratingList} role="list">
        {data.ratings.map((r) => (
          <li key={r.id}>
            <div className={styles.ratingHead}>
              <StarRow value={r.stars} size={15} />
              <span>
                {r.customer} · {day(r.updated_at)}
              </span>
            </div>
            {r.reply && (
              <p className={styles.ratingReply}>
                <strong>Salonun yanıtı:</strong> {r.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.ratingNote}>Yalnızca bu salonda randevusu tamamlanan müşteriler puan verebilir.</p>
    </section>
  );
}
