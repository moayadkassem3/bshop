import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVER_API_URL } from '@/lib/config';
import { Pricing, type Plans } from './Pricing';
import styles from './business.module.css';
import { BackArrow } from '@/components/BackArrow';

export const metadata: Metadata = { title: 'İşletmeler için' };

async function loadPlans(): Promise<Plans | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/public/plans`, {
      cache: 'no-store',
    });
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
        <BackArrow />
        Profil
      </Link>
      <Pricing
        plans={plans}
        intro={
          <section className={styles.hero}>
            <p className={styles.kicker}>İşletmeler için</p>
            <h1 className={styles.title}>Telefona bakamadığınızda bile randevu kaçırmayın.</h1>
            <ul className={styles.benefits}>
              <li>Müşterileriniz boş saatleri görüp kendileri randevu oluşturur.</li>
              <li>Her yeni randevu telefonunuza alarm gibi gelir; tek dokunuşla onaylarsınız.</li>
              <li>Salonunuz haritada ve kendi profil sayfasıyla görünür; QR kodla paylaşırsınız.</li>
            </ul>
          </section>
        }
        apply={
          <section id="basvuru" className={styles.apply}>
            <h2>İşletmenizi kaydedin</h2>
            <p>Birkaç adımda işletmenizi, hizmetlerinizi ve ekibinizi ekleyin; ekibimiz inceledikten sonra randevu almaya başlarsınız.</p>
            <Link className="btn btn-primary" href="/isletme-kaydi">
              Kayda başla
            </Link>
          </section>
        }
      />
    </div>
  );
}
