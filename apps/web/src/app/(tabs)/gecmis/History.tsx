'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { historySeenAt, markHistorySeen, useBusinessShops, type ShopAppointment } from '@/lib/business';
import { useBusinessMode } from '@/lib/session';
import { AppointmentCard } from '../randevularim/BusinessAppointments';
import styles from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';

const DAY = 86_400_000;
const PAGE_DAYS = 60;

type Filter = 'all' | 'cancelled' | 'completed' | 'no_show' | 'declined';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'cancelled', label: 'İptal' },
  { value: 'completed', label: 'Geldi' },
  { value: 'no_show', label: 'Gelmedi' },
  { value: 'declined', label: 'Reddedilen' },
];

/** When something last happened to an appointment: its cancellation, or its start time. */
const eventTime = (a: ShopAppointment) => Date.parse(a.status === 'cancelled' && a.cancelled_at ? a.cancelled_at : a.starts_at);

/**
 * Geçmiş (business mode, v1.7): past appointments with their outcome, and every
 * cancellation, newest first. Cancellations that arrived since the last visit are marked.
 */
export function History() {
  const business = useBusinessMode();
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [days, setDays] = useState(PAGE_DAYS);
  const [items, setItems] = useState<ShopAppointment[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening Geçmiş clears the tab's count; what was new stays marked while the page is open.
  useEffect(() => {
    setSeenBefore(Date.parse(historySeenAt()));
    markHistorySeen();
  }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    const now = Date.now();
    const from = new Date(now - days * DAY).toISOString();
    // Future appointments that were cancelled or declined belong here too.
    const to = new Date(now + 365 * DAY).toISOString();
    try {
      const list = await api<ShopAppointment[]>(`/staff/shops/${shopId}/appointments?from=${from}&to=${to}`);
      setItems(
        list
          .filter((a) => ['cancelled', 'declined'].includes(a.status) || Date.parse(a.starts_at) <= now)
          .sort((x, y) => eventTime(y) - eventTime(x)),
      );
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId, days]);

  useEffect(() => {
    load();
  }, [load]);

  if (!business) {
    return (
      <>
        <header className="page-header">
          <div className="container narrow">
            <h1>Geçmiş</h1>
          </div>
        </header>
        <div className={`container narrow ${styles.body}`}>
          <p className="muted">Geçmiş, işletme modunda görünür.</p>
          <Link href="/profil" className="btn btn-primary">
            Profil
          </Link>
        </div>
      </>
    );
  }

  const shown = (items ?? []).filter((a) => filter === 'all' || a.status === filter);
  const isNew = (a: ShopAppointment) =>
    a.status === 'cancelled' && a.cancel_reason?.startsWith('customer') === true && !!a.cancelled_at && seenBefore !== null && Date.parse(a.cancelled_at) > seenBefore;

  return (
    <>
      <header className={`page-header ${styles.header}`}>
        <div className="container narrow">
          <h1>Geçmiş</h1>
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
      <div className={`container narrow ${styles.body}`}>
        <div className={`${styles.chips} ${biz.staffChips}`} role="radiogroup" aria-label="Durum">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              className={`${styles.chip} ${filter === f.value ? styles.chipOn : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {(error ?? shopsError) && <p className="alert alert-danger">{error ?? shopsError}</p>}
        <div className={styles.wrap}>
          {items && shown.length === 0 && (
            <div className={`card ${styles.empty}`}>
              <h2>Kayıt yok</h2>
              <p>Son {days} günde bu durumda randevu bulunmuyor.</p>
            </div>
          )}
          {shopId &&
            shown.map((a) => (
              <AppointmentCard key={a.id} shopId={shopId} appointment={a} showDate showStaff={shop?.role === 'owner'} isNew={isNew(a)} onChanged={load} />
            ))}
          {items && (
            <button type="button" className="btn" onClick={() => setDays((d) => d + PAGE_DAYS)}>
              Daha eskileri göster
            </button>
          )}
        </div>
      </div>
    </>
  );
}
