'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatPhone } from '@/lib/shop';
import { SkeletonList } from '@/components/Skeleton';
import { StarRow } from '@/components/Stars';
import { shortDate } from './format';
import styles from './admin.module.css';

type AdminRating = {
  id: string;
  stars: number;
  updated_at: string;
  reply: string | null;
  hidden_at: string | null;
  shop_name: string;
  slug: string;
  customer: string;
  customer_phone: string | null;
  customer_ratings: number;
};

/** Değerlendirmeler: every salon's latest ratings, to spot fake or abusive ones and hide them. */
export function RatingsTab() {
  const [low, setLow] = useState(true);
  const [rows, setRows] = useState<AdminRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<AdminRating[]>(`/admin/ratings?low=${low ? 1 : 0}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [low]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function toggle(r: AdminRating) {
    try {
      await api(`/admin/ratings/${r.id}/hidden`, { method: 'PUT', body: { hidden: !r.hidden_at } });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="radiogroup" aria-label="Filtre">
          <button type="button" role="radio" aria-checked={low} className={low ? styles.chipOn : ''} onClick={() => setLow(true)}>
            1–2 yıldız
          </button>
          <button type="button" role="radio" aria-checked={!low} className={!low ? styles.chipOn : ''} onClick={() => setLow(false)}>
            Tümü
          </button>
        </div>
      </div>
      <p className={styles.hint}>Gizlenen bir puan salon sayfasında görünmez ve ortalamaya katılmaz. Yalnızca sahte veya kötüye kullanım amaçlı puanları gizleyin.</p>
      {error && <p className="alert alert-danger">{error}</p>}
      {!rows && !error && <SkeletonList rows={3} />}
      {rows && rows.length === 0 && <p className={styles.empty}>Değerlendirme yok.</p>}
      <ul className={styles.rows} role="list">
        {rows?.map((r) => (
          <li key={r.id} className={`card ${styles.request} ${r.hidden_at ? styles.handled : ''} motion-fade`}>
            <div className={styles.rowMain}>
              <span className={styles.ratingLine}>
                <StarRow value={r.stars} size={15} /> <strong>{r.shop_name}</strong>
                {r.hidden_at && <span className="badge badge-muted">Gizli</span>}
              </span>
              <span>
                {r.customer}
                {r.customer_phone && (
                  <>
                    {' · '}
                    <a href={`tel:${r.customer_phone}`}>{formatPhone(r.customer_phone)}</a>
                  </>
                )}{' '}
                · toplam {r.customer_ratings} puan · {shortDate(r.updated_at)}
              </span>
              {r.reply && <span className={styles.message}>Salonun yanıtı: “{r.reply}”</span>}
            </div>
            <button type="button" className="btn" onClick={() => toggle(r)}>
              {r.hidden_at ? 'Göster' : 'Gizle'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
