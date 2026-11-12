'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { formatPrice, TZ } from '@/lib/format';
import { useCanSell } from '@/lib/store';
import { BackArrow } from '@/components/BackArrow';
import { Icon } from '@/components/Icon';
import { SkeletonList } from '@/components/Skeleton';
import { StartSubscription } from '@/app/isletmeler/Pricing';
import { BACK } from '@/lib/motion';
import page from '../../randevularim/appointments.module.css';
import biz from '../../randevularim/business.module.css';
import sub from '../subscription.module.css';
import { useBusinessGate } from '../gate';
import styles from './payment.module.css';

type Notice = { id: string; months: number; amount_kurus: number; reference: string; status: 'pending' | 'confirmed' | 'rejected'; created_at: string; handled_at?: string };
type Options = {
  shopName: string;
  subscription: { status: string; currentPeriodEnd: string | null };
  seats: number;
  plan: { id: string; name: string; monthlyPriceKurus: number } | null;
  months: number[];
  reference: string;
  methods: { id: 'havale' | 'iyzico' | 'kart'; label: string; enabled: boolean }[];
  account: { holder: string; bank: string; iban: string } | null;
  pendingNotice: Notice | null;
  lastNotice: Notice | null;
};

const day = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
const groupIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim();
const METHOD_NOTE: Record<string, string> = { havale: 'Bankanızın uygulamasından gönderin', iyzico: 'Yakında', kart: 'Yakında' };

/**
 * Ödeme (founder, 12 November 2026): where salon owners pay for the subscription. The
 * reminder SMS link here; the store apps never show it (lib/store.ts). EFT / Havale works
 * now: the owner sends the amount with their phone number in the Açıklama and taps
 * "Ödemeyi yaptım"; our team checks the bank account and confirms. iyzico and bank card
 * are listed but closed until they are set up.
 */
export function Payment() {
  const state = useBusinessGate();
  return state === 'business' ? (
    <OwnerPayment />
  ) : (
    <>
      <Header />
      <div className={`container narrow ${page.body}`}>
        {state === 'checking' && <SkeletonList rows={2} />}
        {state === 'signed-out' && (
          <div className={`card ${sub.card}`}>
            <h2>Ödeme yapmak için giriş yapın</h2>
            <p className="muted">Salonunuzu kaydettiğiniz telefon numarasıyla giriş yapın.</p>
            <Link href="/profil?devam=/abonelik/odeme" className="btn btn-primary">
              Giriş yap
            </Link>
          </div>
        )}
        {state === 'no-business' && <p className="alert alert-info">Bu hesap bir salona bağlı değil.</p>}
      </div>
    </>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={`page-header ${page.header}`}>
      <div className="container narrow">
        <Link transitionTypes={BACK} href="/abonelik" className={sub.back}>
          <BackArrow />
          Aboneliğim
        </Link>
        <h1>Ödeme</h1>
        {children}
      </div>
    </header>
  );
}

function OwnerPayment() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const canSell = useCanSell();
  const [data, setData] = useState<Options | null>(null);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  const load = useCallback(async () => {
    if (!shop || shop.role !== 'owner') return;
    try {
      setData(await api<Options>(`/staff/shops/${shop.id}/payment`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const total = data?.plan ? data.plan.monthlyPriceKurus * months : 0;
  const pending = data?.pendingNotice ?? null;
  const last = data?.lastNotice ?? null;
  const transfer = data?.methods.find((m) => m.id === 'havale')?.enabled;

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
      <div className={`container narrow ${page.body} ${sub.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {shop && !owner && <p className="alert alert-info">Ödemeyi salon sahibi yapar.</p>}
        {/* Never inside the store apps: they do not sell (lib/store.ts). */}
        {canSell === false && <p className="alert alert-info">Bu sayfa uygulama içinde kullanılamaz.</p>}
        {owner && canSell === true && !data && !error && <SkeletonList rows={3} />}
        {owner && canSell === true && data && shop && (
          <div className="motion-fade">
            {pending && (
              <section className={`card ${sub.card} ${sub.warn}`} aria-live="polite">
                <h2>Ödeme bildiriminiz alındı</h2>
                <p>
                  {formatPrice(pending.amount_kurus)} · {pending.months} ay · {day(pending.created_at)}. Ödemeniz hesabımıza ulaşınca aboneliğiniz uzatılır ve SMS ile haber veririz; genellikle aynı iş
                  günü içinde.
                </p>
                <button type="button" className={styles.textButton} disabled={busy} onClick={() => run(() => api(`/staff/shops/${shop.id}/payment-notices/${pending.id}`, { method: 'DELETE' }))}>
                  Bildirimi geri al
                </button>
              </section>
            )}
            {!pending && last?.status === 'rejected' && (
              <section className={`card ${sub.card} ${sub.bad}`}>
                <h2>Ödemeniz hesabımızda görünmüyor</h2>
                <p>Son bildirdiğiniz ödemeyi bulamadık. Açıklamaya telefon numaranızı yazdığınızdan emin olun; ödemeyi yaptıysanız yeniden bildirin.</p>
              </section>
            )}
            {!pending && last?.status === 'confirmed' && data.subscription.currentPeriodEnd && (
              <section className={`card ${sub.card} ${sub.ok}`}>
                <h2>Ödemeniz alındı</h2>
                <p>Aboneliğiniz {day(data.subscription.currentPeriodEnd)} tarihine kadar aktif. Dilerseniz şimdiden uzatabilirsiniz.</p>
              </section>
            )}

            {!data.plan ? (
              <section className={`card ${sub.card}`}>
                <h2>Size özel fiyat</h2>
                <p className="muted">{data.seats} kişi randevu alıyor. Bu büyüklükteki salonlar için fiyatı birlikte belirliyoruz.</p>
                <Link href={`/teklif-al?kaynak=odeme&personel=${data.seats}`} className="btn btn-primary">
                  Teklif alın
                </Link>
              </section>
            ) : (
              <>
                <section className={`card ${sub.card}`} aria-labelledby="amount-title">
                  <h2 id="amount-title">Tutar</h2>
                  <p className={sub.plan}>
                    <strong>{data.plan.name}</strong>
                    <span>{formatPrice(data.plan.monthlyPriceKurus)}/ay</span>
                  </p>
                  <div className={styles.months} role="radiogroup" aria-label="Süre">
                    {data.months.map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={months === m} disabled={Boolean(pending)} className={months === m ? styles.monthOn : ''} onClick={() => setMonths(m)}>
                        {m} ay
                      </button>
                    ))}
                  </div>
                  <p className={styles.total}>
                    Ödenecek tutar <strong>{formatPrice(total)}</strong>
                  </p>
                  <p className="muted">Fiyatlara KDV dahildir.</p>
                </section>

                <section className={`card ${sub.card}`} aria-labelledby="method-title">
                  <h2 id="method-title">Ödeme yöntemi</h2>
                  <ul className={styles.methods} role="list">
                    {data.methods.map((m) => (
                      <li key={m.id} className={`${styles.method} ${m.id === 'havale' && m.enabled ? styles.methodOn : ''} ${m.enabled ? '' : styles.methodOff}`} aria-disabled={!m.enabled}>
                        <span className={styles.methodIcon}>
                          <Icon name={m.id === 'havale' ? 'swap' : 'card'} size={20} />
                        </span>
                        <span className={styles.methodText}>
                          <strong>{m.label}</strong>
                          <span>{m.enabled ? METHOD_NOTE[m.id] : m.id === 'havale' ? 'Hazırlanıyor' : 'Yakında'}</span>
                        </span>
                        {m.id === 'havale' && m.enabled ? <Icon name="check" size={20} className={styles.methodCheck} /> : !m.enabled ? <span className="badge badge-muted">Yakında</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>

                {transfer && data.account ? (
                  <section className={`card ${sub.card}`} aria-labelledby="transfer-title">
                    <h2 id="transfer-title">EFT / Havale bilgileri</h2>
                    <dl className={styles.details}>
                      <Detail label="Alıcı" value={data.account.holder} />
                      <Detail label="Banka" value={data.account.bank} />
                      <Detail label="IBAN" value={groupIban(data.account.iban)} copy={data.account.iban} />
                      <Detail label="Tutar" value={formatPrice(total)} copy={String(total / 100)} />
                      <Detail label="Açıklama" value={data.reference} copy={data.reference} strong />
                    </dl>
                    <p className={styles.referenceNote}>
                      <strong>Açıklama kısmına yalnızca telefon numaranızı yazın: {data.reference}</strong>
                      <br />
                      Ödemenizi bu numarayla eşleştiriyoruz; numara yazılmazsa ödemeniz bulunamayabilir.
                    </p>
                    <ol className={styles.steps}>
                      <li>Bankanızın uygulamasından yukarıdaki IBAN’a tutarı gönderin.</li>
                      <li>Açıklamaya telefon numaranızı yazın.</li>
                      <li>Gönderdikten sonra “Ödemeyi yaptım”a dokunun. Ödeme hesabımıza ulaşınca aboneliğiniz uzatılır, SMS ile haber veririz.</li>
                    </ol>
                    {!pending && (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        disabled={busy}
                        onClick={() => run(() => api(`/staff/shops/${shop.id}/payment-notices`, { method: 'POST', body: { months } }))}
                      >
                        {busy ? 'Bildiriliyor…' : `Ödemeyi yaptım (${formatPrice(total)})`}
                      </button>
                    )}
                  </section>
                ) : (
                  <section className={`card ${sub.card}`}>
                    <h2>EFT / Havale bilgileri hazırlanıyor</h2>
                    <p className="muted">Şimdilik ekibimiz sizi arayıp aboneliğinizi başlatsın.</p>
                    <StartSubscription shop={{ id: shop.id, role: shop.role, subscription_requested_at: null }} />
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Detail({ label, value, copy, strong }: { label: string; value: string; copy?: string; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`${styles.detail} ${strong ? styles.detailStrong : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {copy && (
        <button
          type="button"
          className={styles.copy}
          onClick={() => {
            navigator.clipboard
              ?.writeText(copy)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
      )}
    </div>
  );
}
