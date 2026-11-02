'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { SkeletonList } from '@/components/Skeleton';
import { formatRating } from '@/components/Stars';
import type { AdminTab } from './AdminPanel';
import type { Overview } from './types';
import styles from './admin.module.css';

/** Özet: the business at a glance; each tile opens the matching list. */
export function OverviewTab({ onFilter, onTab }: { onFilter: (filter: string) => void; onTab: (tab: AdminTab) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>('/admin/overview')
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <p className="alert alert-danger">{error}</p>;
  if (!data) return <SkeletonList rows={4} />;
  const s = data.salons;
  const b = data.bookings;

  return (
    <div className="motion-fade">
      {(s.unchecked > 0 || data.open.subscriptions > 0 || data.open.quotes > 0) && (
        <section className={styles.todo} aria-label="Bekleyen işler">
          {s.unchecked > 0 && (
            <button type="button" onClick={() => onFilter('yeni')}>
              <strong>{s.unchecked}</strong> yeni salon kontrol bekliyor ›
            </button>
          )}
          {data.open.subscriptions > 0 && (
            <button type="button" onClick={() => onTab('talepler')}>
              <strong>{data.open.subscriptions}</strong> abonelik talebi ›
            </button>
          )}
          {data.open.quotes > 0 && (
            <button type="button" onClick={() => onTab('talepler')}>
              <strong>{data.open.quotes}</strong> yeni teklif talebi ›
            </button>
          )}
        </section>
      )}

      <h2 className={styles.h2}>Gelir</h2>
      <div className={styles.tiles}>
        <Tile label="Aylık tekrarlayan gelir" value={formatPrice(data.mrrKurus)} note={`${s.paying} ödeyen salonun paketi`} />
        <Tile label="Bu ay tahsilat" value={formatPrice(data.payments.this_month)} note={`Geçen ay ${formatPrice(data.payments.last_month)}`} />
      </div>

      <h2 className={styles.h2}>Salonlar</h2>
      <div className={styles.tiles}>
        <Tile label="Yayında" value={s.live} note={`Toplam ${s.total} kayıt`} onClick={() => onFilter('tumu')} />
        <Tile label="Denemede" value={s.trial} onClick={() => onFilter('deneme')} />
        <Tile label="Ödüyor" value={s.paying} onClick={() => onFilter('aktif')} />
        <Tile label="Ödeme bekleyen" value={s.late + s.hidden} note={`${s.late} gecikmiş · ${s.hidden} gizli`} tone={s.late + s.hidden ? 'warning' : undefined} onClick={() => onFilter('odeme')} />
        <Tile label="Yeni salon" value={s.new_7d} note={`Son 7 gün · 30 günde ${s.new_30d}`} />
        <Tile label="Kaldırılan" value={s.suspended} onClick={() => onFilter('kapali')} />
      </div>

      <h2 className={styles.h2}>Kullanım · son 30 gün</h2>
      <div className={styles.tiles}>
        <Tile label="Online randevu" value={b.total} note={`${b.completed} geldi · ${b.no_show} gelmedi · ${b.cancelled} iptal`} />
        <Tile label="Müşteri" value={data.customers.total} note={`${data.customers.new_30d} yeni`} />
        <Tile
          label="Değerlendirme"
          value={data.ratings.count}
          note={data.ratings.average != null ? `Ortalama ★ ${formatRating(data.ratings.average)}` : 'Henüz yok'}
          onClick={() => onTab('puanlar')}
        />
      </div>
    </div>
  );
}

function Tile(props: { label: string; value: string | number; note?: string; tone?: 'warning'; onClick?: () => void }) {
  const body = (
    <>
      <span className={styles.tileLabel}>{props.label}</span>
      <span className={styles.tileValue}>{typeof props.value === 'number' ? props.value.toLocaleString('tr-TR') : props.value}</span>
      {props.note && <span className={styles.tileNote}>{props.note}</span>}
    </>
  );
  const cls = `card ${styles.tile} ${props.tone === 'warning' ? styles.tileWarn : ''}`;
  return props.onClick ? (
    <button type="button" className={`${cls} ${styles.tileButton}`} onClick={props.onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
