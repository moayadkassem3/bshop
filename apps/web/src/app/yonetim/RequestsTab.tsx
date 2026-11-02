'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { formatPhone } from '@/lib/shop';
import { SkeletonList } from '@/components/Skeleton';
import { shortDate } from './format';
import type { Plan } from './types';
import styles from './admin.module.css';

type SubscriptionRequest = {
  id: string;
  shop_id: string;
  created_at: string;
  handled_at: string | null;
  shop_name: string;
  city: string | null;
  district: string | null;
  subscription_status: string;
  seats: number;
  plan: Plan | null;
  phone: string | null;
  requester: string;
};
type Quote = {
  id: string;
  salon_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  staff_count: number;
  branch_count: number;
  city: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
};

const QUOTE_STATUS = { new: 'Yeni', contacted: 'Arandı', closed: 'Kapandı' } as const;

/** Talepler: salons asking to start their subscription, and custom-price requests (10+ staff). */
export function RequestsTab({ onSalon }: { onSalon: (id: string) => void }) {
  const [data, setData] = useState<{ subscriptions: SubscriptionRequest[]; quotes: Quote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api('/admin/requests'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function setQuote(id: string, status: Quote['status']) {
    try {
      await api(`/admin/quote-requests/${id}`, { method: 'PUT', body: { status } });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error) return <p className="alert alert-danger">{error}</p>;
  if (!data) return <SkeletonList rows={3} />;
  return (
    <div className="motion-fade">
      <h2 className={styles.h2}>Abonelik talepleri</h2>
      <p className={styles.hint}>Salon “Aboneliği başlat”a bastı: arayın, ödemeyi alın, salonun sayfasından “Ödeme kaydet”.</p>
      {data.subscriptions.length === 0 && <p className={styles.empty}>Talep yok.</p>}
      <ul className={styles.rows} role="list">
        {data.subscriptions.map((r) => (
          <li key={r.id} className={`card ${styles.request} ${r.handled_at ? styles.handled : ''}`}>
            <div className={styles.rowMain}>
              <strong>{r.shop_name}</strong>
              <span>
                {[r.district, r.city].filter(Boolean).join(', ')} · {shortDate(r.created_at)} · {r.plan ? `${r.plan.name} · ${formatPrice(r.plan.monthlyPriceKurus)}/ay` : `${r.seats} personel`}
              </span>
              <span>
                {r.requester.trim() || 'Sahibi'} · {r.phone ? <a href={`tel:${r.phone}`}>{formatPhone(r.phone)}</a> : '—'}
                {r.handled_at && <span className="muted"> · kapandı {shortDate(r.handled_at)}</span>}
              </span>
            </div>
            <button type="button" className="btn" onClick={() => onSalon(r.shop_id)}>
              Salonu aç
            </button>
          </li>
        ))}
      </ul>

      <h2 className={styles.h2}>Teklif talepleri (10+ personel)</h2>
      {data.quotes.length === 0 && <p className={styles.empty}>Talep yok.</p>}
      <ul className={styles.rows} role="list">
        {data.quotes.map((q) => (
          <li key={q.id} className={`card ${styles.request} ${q.status === 'closed' ? styles.handled : ''}`}>
            <div className={styles.rowMain}>
              <strong>
                {q.salon_name} · {q.staff_count} personel{q.branch_count > 1 ? ` · ${q.branch_count} şube` : ''}
              </strong>
              <span>
                {q.contact_name} · <a href={`tel:${q.phone}`}>{formatPhone(q.phone)}</a>
                {q.email && (
                  <>
                    {' · '}
                    <a href={`mailto:${q.email}`}>{q.email}</a>
                  </>
                )}
                {q.city ? ` · ${q.city}` : ''} · {shortDate(q.created_at)}
              </span>
              {q.message && <span className={styles.message}>“{q.message}”</span>}
            </div>
            <select className="input" value={q.status} aria-label="Durum" onChange={(e) => setQuote(q.id, e.target.value as Quote['status'])}>
              {Object.entries(QUOTE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
