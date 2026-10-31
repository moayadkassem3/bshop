'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import type { ViewSource } from '@/lib/views';
import page from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import styles from './stats.module.css';
import { BackArrow } from '@/components/BackArrow';

type ShopStats = {
  month: string;
  today: string;
  views: { total: number; bySource: Record<ViewSource, number>; daily: { date: string; views: number }[] };
  appointments: { total: number; completed: number; upcoming: number; noShow: number; cancelled: number };
};

const SOURCES: { key: ViewSource; label: string }[] = [
  { key: 'kesfet', label: 'Keşfet (harita ve liste)' },
  { key: 'kesimler', label: 'Popüler kesimler' },
  { key: 'qr', label: 'QR kod' },
  { key: 'diger', label: 'Bağlantı ve diğer' },
];

const MONTHS_BACK = 24;
const monthName = (month: string) =>
  new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const dayName = (date: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * İstatistikler (v1.7), for owners: a month of visits to the salon's page (by
 * day and by where visitors came from) and the month's appointments.
 */
export function Stats() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [month, setMonth] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  useEffect(() => {
    if (!shop || shop.role !== 'owner') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<ShopStats>(`/staff/shops/${shop.id}/stats${month ? `?month=${month}` : ''}`)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
        setCurrent((c) => c ?? s.month);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [shop, month]);

  const shown = stats?.month ?? month;
  const oldest = current ? shiftMonth(current, -MONTHS_BACK) : null;

  return (
    <>
      <header className={`page-header ${page.header}`}>
        <div className="container narrow">
          <Link href="/salonum" className={styles.back}>
            <BackArrow />
            Salonum
          </Link>
          <h1>İstatistikler</h1>
          {shops && shops.length > 1 ? (
            <select
              className={biz.shopSelect}
              value={shopId ?? ''}
              aria-label="İşletme"
              onChange={(e) => {
                selectShop(e.target.value);
                setMonth(null);
                setCurrent(null);
              }}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            shop && <p>{shop.name}</p>
          )}
          {owner && shown && (
            <div className={styles.monthBar}>
              <button type="button" aria-label="Önceki ay" disabled={loading || shown === oldest} onClick={() => setMonth(shiftMonth(shown, -1))}>
                ‹
              </button>
              <span aria-live="polite">{monthName(shown)}</span>
              <button type="button" aria-label="Sonraki ay" disabled={loading || shown === current} onClick={() => setMonth(shiftMonth(shown, 1))}>
                ›
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`container narrow ${page.body} ${styles.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}
        {shop && !owner && <p className="alert alert-info">İstatistikleri salon sahibi ve ortaklar görür.</p>}
        {owner && stats && (
          // The previous month stays on screen, dimmed, while the next one loads.
          <div className={loading ? styles.refreshing : undefined}>
            <Overview stats={stats} />
            <Sources stats={stats} />
            <Daily stats={stats} />
            <p className={styles.footnote}>
              Ziyaretler tarayıcı oturumu başına bir kez sayılır; salon ekibinin kendi ziyaretleri sayılmaz. Bu güncellemeden önce bastırılan QR kodların taramaları
              “Bağlantı ve diğer” altında görünür; QR kodunuzu yeniden indirirseniz ayrı sayılır.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Overview({ stats }: { stats: ShopStats }) {
  const a = stats.appointments;
  const thisMonth = stats.month === stats.today.slice(0, 7);
  return (
    <section className={styles.kpis} aria-label="Özet">
      <div className={`card ${styles.tile}`}>
        <span className={styles.tileLabel}>Salon sayfası ziyareti</span>
        <span className={styles.tileValue}>{stats.views.total.toLocaleString('tr-TR')}</span>
        <span className={styles.tileNote}>{thisMonth ? 'Ay başından bugüne' : 'Ay boyunca'}</span>
      </div>
      <div className={`card ${styles.tile}`}>
        <span className={styles.tileLabel}>Randevu</span>
        <span className={styles.tileValue}>{a.total.toLocaleString('tr-TR')}</span>
        <span className={styles.tileNote}>
          {a.completed} tamamlandı{a.upcoming ? ` · ${a.upcoming} ${thisMonth ? 'yaklaşan' : 'kapanmadı'}` : ''}
        </span>
      </div>
      {(a.cancelled > 0 || a.noShow > 0) && (
        <p className={styles.kpiFoot}>
          {a.cancelled > 0 && `${a.cancelled} iptal (toplama dahil değil)`}
          {a.cancelled > 0 && a.noShow > 0 && ' · '}
          {a.noShow > 0 && `${a.noShow} müşteri gelmedi`}
        </p>
      )}
    </section>
  );
}

/** Visits by where they came from: one bar per source, in a fixed order, one colour. */
function Sources({ stats }: { stats: ShopStats }) {
  const total = stats.views.total;
  const max = Math.max(1, ...SOURCES.map((s) => stats.views.bySource[s.key]));
  return (
    <section className={`card ${styles.card}`} aria-labelledby="sources-title">
      <h2 id="sources-title">Ziyaretler nereden geldi</h2>
      <ul className={styles.sources} role="list">
        {SOURCES.map((s) => {
          const n = stats.views.bySource[s.key];
          return (
            <li key={s.key}>
              <span className={styles.sourceLabel}>{s.label}</span>
              <span className={styles.sourceRow}>
                <span className={styles.track}>
                  {n > 0 && <span className={styles.bar} style={{ width: `${(n / max) * 100}%` }} />}
                </span>
                <span className={styles.sourceValue}>
                  {n.toLocaleString('tr-TR')}
                  {n > 0 && <span> · %{Math.round((n / total) * 100)}</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Visits per day: one column per day; hover or tap a day for its number, or open the table. */
function Daily({ stats }: { stats: ShopStats }) {
  const days = stats.views.daily;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.views), 0);
  const top = niceMax(max);
  const best = days.reduce<{ date: string; views: number } | null>((b, d) => (d.views > (b?.views ?? 0) ? d : b), null);
  const active = hover !== null ? days[hover] : null;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="daily-title">
      <h2 id="daily-title">Günlük ziyaret</h2>
      <p className={styles.cardNote}>{best ? `En yoğun gün: ${dayName(best.date)} (${best.views})` : 'Bu ay henüz ziyaret yok.'}</p>
      <div className={styles.chart} onPointerLeave={() => setHover(null)}>
        <span className={styles.yTop}>{top}</span>
        <span className={styles.yZero}>0</span>
        <div className={styles.plot} role="img" aria-label={`Günlük ziyaret grafiği; değerler aşağıdaki tabloda.`}>
          <span className={styles.grid} style={{ bottom: '100%' }} />
          {days.map((d, i) => (
            <span
              key={d.date}
              className={`${styles.slot} ${hover === i ? styles.slotOn : ''}`}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            >
              {d.views > 0 && <span className={styles.col} style={{ height: `${(d.views / top) * 100}%` }} />}
            </span>
          ))}
          {active && hover !== null && (
            <span className={styles.tip} style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}>
              {dayName(active.date)}: <strong>{active.views}</strong> ziyaret
            </span>
          )}
        </div>
        <div className={styles.xAxis}>
          <span>{Number(days[0]?.date.slice(8))}</span>
          {days.length > 2 && <span>{Number(days[days.length - 1]!.date.slice(8))}</span>}
        </div>
      </div>
      <details className={styles.table}>
        <summary>Tablo olarak gör</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Gün</th>
              <th scope="col">Ziyaret</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{dayName(d.date)}</td>
                <td>{d.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** A round axis top at or above the largest value (5, 10, 20, 30, 50, 100 ...). */
function niceMax(max: number): number {
  if (max <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 3, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}
