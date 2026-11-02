'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { BackArrow } from '@/components/BackArrow';
import { SkeletonList } from '@/components/Skeleton';
import { formatRating, StarRow } from '@/components/Stars';
import { BACK } from '@/lib/motion';
import type { Rating } from '@/lib/types';
import page from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import styles from './ratings.module.css';

type TeamRatings = { count: number; average: number | null; rating: number | null; minimum: number; distribution: number[]; ratings: Rating[] };

const day = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

/**
 * Değerlendirmeler (v1.7): the stars customers gave the salon after completed
 * visits. The whole team can read them; owners answer each once, publicly.
 */
export function ShopRatings() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [data, setData] = useState<TeamRatings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      setData(await api<TeamRatings>(`/staff/shops/${shopId}/ratings`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const max = Math.max(1, ...(data?.distribution ?? []));

  return (
    <>
      <header className={`page-header ${page.header}`}>
        <div className="container narrow">
          <Link transitionTypes={BACK} href="/salonum" className={styles.back}>
            <BackArrow />
            Salonum
          </Link>
          <h1>Değerlendirmeler</h1>
          {shops && shops.length > 1 ? (
            <select className={biz.shopSelect} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            shop && <p>{shop.name}</p>
          )}
        </div>
      </header>

      <div className={`container narrow ${page.body} ${styles.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {!data && !error && !shopsError && <SkeletonList rows={3} label="Değerlendirmeler yükleniyor" />}

        {data && data.count === 0 && (
          <div className={`card ${page.empty} motion-fade`}>
            <h2>Henüz değerlendirme yok</h2>
            <p>Müşteriler, randevuları “Geldi” olarak işaretlendikten sonra 14 gün içinde 1–5 yıldız verebilir.</p>
          </div>
        )}

        {data && data.count > 0 && (
          <div className="motion-fade">
            <section className={`card ${styles.summary}`} aria-label="Özet">
              <div className={styles.big}>
                <strong>{data.average != null ? formatRating(data.average) : '–'}</strong>
                <StarRow value={Math.round(data.average ?? 0)} size={18} />
                <span>{data.count} müşteri</span>
              </div>
              <ul className={styles.bars} role="list" aria-label="Yıldız dağılımı">
                {data.distribution.map((n, i) => (
                  <li key={i}>
                    <span>{5 - i}</span>
                    <span className={styles.track}>{n > 0 && <span style={{ width: `${(n / max) * 100}%` }} />}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
              {data.count < data.minimum && (
                <p className={styles.notYet}>
                  Ortalamanız, {data.minimum} müşteri puan verdikten sonra müşterilere görünür. Şimdilik yalnızca puanlar listelenir.
                </p>
              )}
            </section>

            <ul className={styles.list} role="list">
              {data.ratings.map((r) => (
                <RatingItem key={r.id} shopId={shopId!} rating={r} canReply={owner} onChanged={load} />
              ))}
            </ul>
            <p className={styles.footnote}>
              Her müşterinin salonunuza verdiği son puan sayılır. Uygunsuz veya sahte olduğunu düşündüğünüz bir puan için bizimle iletişime geçin.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function RatingItem({ shopId, rating: r, canReply, onChanged }: { shopId: string; rating: Rating; canReply: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${shopId}/ratings/${r.id}/reply`, { method: 'PUT', body: { text: value.trim() } });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`card ${styles.item}`}>
      <div className={styles.head}>
        <StarRow value={r.stars} size={16} />
        <span>
          {r.customer} · {day(r.updated_at)}
        </span>
      </div>
      {r.reply && !editing && (
        <p className={styles.reply}>
          <strong>Yanıtınız:</strong> {r.reply}
        </p>
      )}
      {canReply && !editing && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setText(r.reply ?? '');
              setEditing(true);
            }}
          >
            {r.reply ? 'Yanıtı düzenle' : 'Yanıtla'}
          </button>
          {r.reply && (
            <button type="button" className={`${styles.link} ${styles.danger}`} disabled={busy} onClick={() => save('')}>
              Yanıtı sil
            </button>
          )}
        </div>
      )}
      {editing && (
        <div className={`${styles.form} motion-reveal`}>
          <label htmlFor={`reply-${r.id}`} className={styles.label}>
            Herkese açık yanıt
          </label>
          <textarea id={`reply-${r.id}`} className="input" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Örn. Teşekkür ederiz, yine bekleriz!" />
          <span className={styles.counter}>{text.length}/300</span>
          <div className={styles.formActions}>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => save(text)}>
              Yanıtı yayınla
            </button>
          </div>
        </div>
      )}
      {error && <p className="alert alert-danger">{error}</p>}
    </li>
  );
}
