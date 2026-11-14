'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { daysLeft, useBusinessShops } from '@/lib/business';
import { formatPrice, TZ } from '@/lib/format';
import { useCanSell } from '@/lib/store';
import { BackArrow } from '@/components/BackArrow';
import { SkeletonList } from '@/components/Skeleton';
import { BACK, FORWARD } from '@/lib/motion';
import page from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import { useBusinessGate } from './gate';
import styles from './subscription.module.css';

type Subscription = {
  status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
  grace_until: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  visible: boolean;
  seats: number;
  open_request_at: string | null;
  plan: { id: string; name: string; monthlyPriceKurus: number } | null;
  terms: { customQuoteAboveStaff: number };
  payments: { amount_kurus: number; months: number; method: string; period_end: string; created_at: string }[];
};

const day = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));

/**
 * Aboneliğim (v1.7): the salon's subscription for its owner. The SMS reminders
 * link here. On the website it also offers "Aboneliği başlat" and prices; in the
 * store apps it is read-only (lib/store.ts).
 */
export function MySubscription() {
  const state = useBusinessGate();

  return (
    <>
      {state === 'business' ? (
        <OwnerView />
      ) : (
        <>
          <Header />
          <div className={`container narrow ${page.body}`}>
            {state === 'checking' && <SkeletonList rows={2} />}
            {state === 'signed-out' && (
              <div className={`card ${styles.card}`}>
                <h2>Aboneliğinizi görmek için giriş yapın</h2>
                <p className="muted">Salonunuzu kaydettiğiniz telefon numarasıyla giriş yapın.</p>
                <Link href="/profil?devam=/abonelik" className="btn btn-primary">
                  Giriş yap
                </Link>
              </div>
            )}
            {state === 'no-business' && <p className="alert alert-info">Bu hesap bir salona bağlı değil.</p>}
          </div>
        </>
      )}
    </>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={`page-header ${page.header}`}>
      <div className="container narrow">
        <Link transitionTypes={BACK} href="/salonum" className={styles.back}>
          <BackArrow />
          Salonum
        </Link>
        <h1>Aboneliğim</h1>
        {children}
      </div>
    </header>
  );
}

function OwnerView() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const canSell = useCanSell();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  useEffect(() => {
    if (!shop) return;
    setSub(null);
    api<Subscription>(`/staff/shops/${shop.id}/subscription`)
      .then(setSub)
      .catch((err) => setError(errorMessage(err)));
  }, [shop]);

  return (
    <>
      <Header>
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
      </Header>
      <div className={`container narrow ${page.body} ${styles.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}
        {shop && !sub && !error && <SkeletonList rows={2} />}
        {sub && shop && (
          <div className="motion-fade">
            <section className={`card ${styles.card} ${styles[toneOf(sub)]}`} aria-label="Durum">
              <Status sub={sub} />
            </section>

            <section className={`card ${styles.card}`} aria-labelledby="plan-title">
              <h2 id="plan-title">Paketiniz</h2>
              <p className={styles.plan}>
                <strong>{sub.plan ? sub.plan.name : `${sub.terms.customQuoteAboveStaff}’dan fazla personel`}</strong>
                {canSell === true && owner && <span>{sub.plan ? `${formatPrice(sub.plan.monthlyPriceKurus)}/ay` : 'Size özel fiyat'}</span>}
              </p>
              <p className="muted">{sub.seats} kişi randevu alıyor. Paket, randevu alan personel sayısına göre belirlenir.</p>
              {/* The payment page (EFT / Havale; founder, 12 November 2026): the main button while the
                  salon needs to pay, a quieter one to pay ahead. Never in the store apps. */}
              {canSell === true && owner && !sub.suspended_at && (
                <div className={styles.actions}>
                  <Link transitionTypes={FORWARD} href="/abonelik/odeme" className={`btn ${sub.status !== 'active' || daysLeft(sub.current_period_end) <= 7 ? 'btn-primary' : ''}`}>
                    {sub.status === 'active' ? 'Aboneliği uzat' : 'Ödeme yap'}
                  </Link>
                </div>
              )}
              {/* Staff: the state and the package's name only (founder, 14 November 2026). */}
              {!owner && <p className="alert alert-info">Aboneliği salon sahibi ve ortaklar takip eder.</p>}
              {canSell === true && owner && (
                <Link transitionTypes={FORWARD} href="/isletmeler" className={styles.link}>
                  Tüm paketler ve fiyatlar ›
                </Link>
              )}
            </section>

            {sub.payments.length > 0 && (
              <section className={`card ${styles.card}`} aria-labelledby="history-title">
                <h2 id="history-title">Geçmiş</h2>
                <ul className={styles.history} role="list">
                  {sub.payments.map((p, i) => (
                    <li key={i}>
                      <span>
                        {day(p.created_at)} · {p.months} ay
                      </span>
                      <span className="muted">
                        {p.method === 'yok' ? 'Ödemesiz etkinleştirildi' : canSell === true ? `${formatPrice(p.amount_kurus)} ödendi` : 'Ödendi'} · {day(p.period_end)} tarihine kadar
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function toneOf(sub: Subscription): 'ok' | 'warn' | 'bad' {
  if (sub.suspended_at || !sub.visible) return 'bad';
  if (sub.status === 'past_due' || (sub.status === 'trial' && daysLeft(sub.current_period_end) <= 3)) return 'warn';
  return 'ok';
}

/** The state in plain words; facts only, so it reads the same in the apps. */
function Status({ sub }: { sub: Subscription }) {
  if (sub.suspended_at) {
    return (
      <>
        <h2>Salonunuz yayından kaldırıldı</h2>
        <p>{sub.suspended_reason}</p>
      </>
    );
  }
  const end = sub.current_period_end;
  if (sub.status === 'active' && end) {
    return (
      <>
        <h2>Aboneliğiniz aktif</h2>
        <p>
          {day(end)} tarihine kadar · {daysLeft(end)} gün kaldı
        </p>
      </>
    );
  }
  if (sub.status === 'trial' && sub.visible && end) {
    return (
      <>
        <h2>Ücretsiz deneme · {daysLeft(end)} gün kaldı</h2>
        <p>{day(end)} tarihinde bitiyor. Bittiğinde salonunuz müşterilere gizlenir.</p>
      </>
    );
  }
  if (sub.status === 'past_due' && sub.visible && sub.grace_until) {
    return (
      <>
        <h2>Aboneliğinizin süresi doldu</h2>
        <p>Salonunuz {day(sub.grace_until)} tarihine kadar görünür kalacak.</p>
      </>
    );
  }
  return (
    <>
      <h2>Salonunuz müşterilere görünmüyor</h2>
      <p>{sub.status === 'trial' ? 'Ücretsiz deneme süreniz bitti.' : 'Aboneliğiniz aktif değil.'} Mevcut randevularınız geçerli.</p>
    </>
  );
}
