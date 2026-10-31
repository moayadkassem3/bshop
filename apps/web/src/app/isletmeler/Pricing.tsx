'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { daysLeft, useBusinessShops, type BusinessShop } from '@/lib/business';
import { formatPrice, TZ } from '@/lib/format';
import { getToken, useBusinessMode } from '@/lib/session';
import type { Me } from '@/lib/types';
import styles from './business.module.css';

export type Plans = {
  plans: { id: string; name: string; maxStaff: number; monthlyPriceKurus: number }[];
  features: string[];
  terms: { vatIncluded: boolean; trialDays: number; customQuoteAboveStaff: number };
};

/**
 * Prices, for prospects and for salons already with us (v1.7). A signed-in
 * business sees its own plan first and highlighted, with the trial days left,
 * and none of the sign-up pitch (`intro`, `apply`).
 */
export function Pricing({ plans, intro, apply }: { plans: Plans | null; intro: ReactNode; apply: ReactNode }) {
  const business = useBusinessMode();
  const { shops, shop, shopId, selectShop } = useBusinessShops(business);
  const hasBusiness = useHasBusiness(!business);
  const registered = business ? Boolean(shops?.length) : hasBusiness;
  const mine = business ? shop : null;

  const current = mine && plans ? plans.plans.find((p) => p.id === mine.plan_id) ?? null : null;
  const ordered = plans ? (current ? [current, ...plans.plans.filter((p) => p !== current)] : plans.plans) : [];

  return (
    <>
      {!registered && intro}

      {plans && (
        <section className={`${styles.pricing} ${registered ? styles.pricingFirst : ''}`} aria-labelledby="pricing-title">
          {registered ? (
            <h1 id="pricing-title" className={styles.pageTitle}>
              Paketler ve fiyatlar
            </h1>
          ) : (
            <h2 id="pricing-title">Aylık abonelik</h2>
          )}
          <p className="muted">
            Ücret, randevu alan personel sayınıza göre belirlenir.{plans.terms.vatIncluded && ' Fiyatlara KDV dahildir.'}
          </p>
          {shops && shops.length > 1 && (
            <select className={`input ${styles.shopSelect}`} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {mine ? <Status shop={mine} trialDays={plans.terms.trialDays} /> : <p className={styles.trial}>İlk {plans.terms.trialDays} gün ücretsiz: deneme, salonunuz onaylandığında başlar.</p>}
          {mine && !current && (
            <p className={`card ${styles.plan} ${styles.planCurrent} ${styles.planWide}`}>
              <span className={styles.planBadge}>Paketiniz</span>
              <span className={styles.planName}>{mine.seats} randevu alan personel: size özel fiyat</span>
              <Link href={`/teklif-al?${new URLSearchParams({ personel: String(mine.seats), salon: mine.name })}`} className={styles.quoteLink}>
                Teklif alın ›
              </Link>
            </p>
          )}
          <ul className={styles.plans} role="list">
            {ordered.map((p) => {
              const isCurrent = p === current;
              return (
                <li key={p.id} className={`card ${styles.plan} ${isCurrent ? `${styles.planCurrent} ${styles.planWide}` : ''}`} aria-current={isCurrent || undefined}>
                  {isCurrent && <span className={styles.planBadge}>Mevcut paketiniz</span>}
                  <span className={styles.planName}>{p.name}</span>
                  <span className={styles.planPrice}>
                    {formatPrice(p.monthlyPriceKurus)}
                    <span>/ay</span>
                  </span>
                  {isCurrent && mine && <span className={styles.planSeats}>{mine.seats} randevu alan personeliniz var</span>}
                </li>
              );
            })}
          </ul>
          <ul className={styles.features}>
            {plans.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <p className={styles.note}>
            {plans.terms.customQuoteAboveStaff}’dan fazla personel için{' '}
            <Link href="/teklif-al">size özel teklif alın</Link>.
          </p>
        </section>
      )}

      {!registered && apply}
    </>
  );
}

const endDate = (iso: string) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso));

/** The salon's subscription state: trial days left, renewal, or what is missing. */
function Status({ shop, trialDays }: { shop: BusinessShop; trialDays: number }) {
  if (!shop.reviewed_at) {
    return <p className={styles.trial}>Salonunuz incelemede. {trialDays} günlük ücretsiz deneme, onaylandığında başlar.</p>;
  }
  const end = shop.current_period_end;
  if (!shop.visible) {
    const title =
      shop.subscription_status === 'trial' ? 'Ücretsiz deneme süreniz bitti.' : shop.subscription_status === 'past_due' ? 'Ödemeniz yapılmadı.' : 'Aboneliğiniz aktif değil.';
    return (
      <div className={`${styles.trial} ${styles.trialOver}`}>
        <p className={styles.statusText}>
          <strong>{title}</strong> Salonunuz müşterilere görünmüyor ve yeni randevu alamıyor. Abonelik başlayınca hemen yeniden açılır.
        </p>
        <StartSubscription shop={shop} />
      </div>
    );
  }
  if (shop.subscription_status === 'trial' && end) {
    return (
      <p className={styles.trial}>
        Ücretsiz deneme: <strong className={styles.trialDays}>{daysLeft(end)} gün</strong> kaldı
        <span className={styles.trialEnd}>{endDate(end)} tarihine kadar</span>
      </p>
    );
  }
  if (shop.subscription_status === 'past_due') {
    return (
      <div className={`${styles.trial} ${styles.trialOver}`}>
        <p className={styles.statusText}>
          <strong>Ödemeniz gecikti.</strong> Ödeme yapılana kadar salonunuz kısa süre sonra müşterilere gizlenir.
        </p>
        <StartSubscription shop={shop} />
      </div>
    );
  }
  return <p className={styles.trial}>Aboneliğiniz aktif{end ? ` · yenileme ${endDate(end)}` : ''}.</p>;
}

/**
 * "Aboneliği başlat": until online payment is in place, the owner asks our team,
 * who call back and start the subscription. Staff are told to ask the owner.
 */
function StartSubscription({ shop }: { shop: BusinessShop }) {
  const [requested, setRequested] = useState(shop.subscription_requested_at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (shop.role !== 'owner') return <p className={styles.statusText}>Aboneliği salon sahibi başlatabilir.</p>;
  if (requested) return <p className={styles.statusText}>Talebiniz alındı. Ekibimiz sizi arayıp aboneliğinizi başlatacak.</p>;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ requestedAt: string }>(`/staff/shops/${shop.id}/subscription-request`, { method: 'POST' });
      setRequested(r.requestedAt);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`btn ${styles.startBtn}`} disabled={busy} onClick={start}>
        Aboneliği başlat
      </button>
      <p className={styles.statusNote}>Online ödeme yakında. Şimdilik ekibimiz sizi arayıp paketinizi başlatır.</p>
      {error && <p className="alert alert-danger">{error}</p>}
    </>
  );
}

/** In customer mode, whether this account also belongs to a salon (then it has nothing to register). */
function useHasBusiness(enabled: boolean): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!enabled || !getToken()) return;
    api<Me>('/me')
      .then((me) => setHas(Boolean(me.has_business)))
      .catch(() => undefined);
  }, [enabled]);
  return has;
}
