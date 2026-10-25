import type { Metadata } from 'next';
import Link from 'next/link';
import { SALES_EMAIL, SERVER_API_URL } from '@/lib/config';
import { formatPrice } from '@/lib/format';
import styles from './business.module.css';

export const metadata: Metadata = { title: 'İşletmeler için' };

type Plans = {
  plans: { id: string; name: string; maxStaff: number; monthlyPriceKurus: number }[];
  features: string[];
  terms: { vatIncluded: boolean; trialDays: number; customQuoteAboveStaff: number };
};

async function loadPlans(): Promise<Plans | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/public/plans`, { cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export default async function BusinessPage() {
  const plans = await loadPlans();
  return (
    <div className="container narrow">
      <Link href="/profil" className={styles.back}>
        ← Profil
      </Link>
      <section className={styles.hero}>
        <p className={styles.kicker}>İşletmeler için</p>
        <h1 className={styles.title}>Telefona bakamadığınızda bile randevu kaçırmayın.</h1>
        <ul className={styles.benefits}>
          <li>Müşterileriniz boş saatleri görüp kendileri randevu oluşturur.</li>
          <li>Her yeni randevu telefonunuza alarm gibi gelir; tek dokunuşla onaylarsınız.</li>
          <li>Salonunuz haritada ve kendi profil sayfasıyla görünür; QR kodla paylaşırsınız.</li>
        </ul>
      </section>

      {plans && (
        <section className={styles.pricing} aria-labelledby="pricing-title">
          <h2 id="pricing-title">Aylık abonelik</h2>
          <p className="muted">
            Ücret, randevu alan personel sayınıza göre belirlenir.{plans.terms.vatIncluded && ' Fiyatlara KDV dahildir.'}
          </p>
          <p className={styles.trial}>İlk {plans.terms.trialDays} gün ücretsiz: deneme, salonunuz onaylandığında başlar.</p>
          <ul className={styles.plans} role="list">
            {plans.plans.map((p) => (
              <li key={p.id} className={`card ${styles.plan}`}>
                <span className={styles.planName}>{p.name}</span>
                <span className={styles.planPrice}>
                  {formatPrice(p.monthlyPriceKurus)}
                  <span>/ay</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className={styles.features}>
            {plans.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <p className={styles.note}>
            {plans.terms.customQuoteAboveStaff}’dan fazla personel için{' '}
            {SALES_EMAIL ? (
              <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Fiyat teklifi')}`}>e-postayla teklif alın</a>
            ) : (
              'size özel teklif hazırlıyoruz'
            )}
            .
          </p>
        </section>
      )}

      <section id="basvuru" className={styles.apply}>
        <h2>İşletmenizi kaydedin</h2>
        <p>Birkaç adımda işletmenizi, hizmetlerinizi ve ekibinizi ekleyin; ekibimiz inceledikten sonra randevu almaya başlarsınız.</p>
        <Link className="btn btn-primary" href="/isletme-kaydi">
          Kayda başla
        </Link>
      </section>
    </div>
  );
}
