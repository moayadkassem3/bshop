'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { daysLeft, useBusinessShops, type BusinessShop } from '@/lib/business';
import { SALES_EMAIL } from '@/lib/config';
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
            {SALES_EMAIL ? <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Fiyat teklifi')}`}>e-postayla teklif alın</a> : 'size özel teklif hazırlıyoruz'}.
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
  if (shop.subscription_status === 'trial' && end) {
    const days = daysLeft(end);
    return days ? (
      <p className={styles.trial}>
        Ücretsiz deneme: <strong className={styles.trialDays}>{days} gün</strong> kaldı
        <span className={styles.trialEnd}>{endDate(end)} tarihine kadar</span>
      </p>
    ) : (
      <p className={`${styles.trial} ${styles.trialOver}`}>Ücretsiz deneme süreniz bitti. Randevu almaya devam etmek için paketinizi başlatın.</p>
    );
  }
  if (shop.subscription_status === 'active') {
    return <p className={styles.trial}>Aboneliğiniz aktif{end ? ` · yenileme ${endDate(end)}` : ''}.</p>;
  }
  if (shop.subscription_status === 'past_due') {
    return <p className={`${styles.trial} ${styles.trialOver}`}>Ödemeniz bekleniyor. Salonunuz kısa süre içinde randevu almayı durdurur.</p>;
  }
  return <p className={`${styles.trial} ${styles.trialOver}`}>Aboneliğiniz aktif değil.</p>;
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
