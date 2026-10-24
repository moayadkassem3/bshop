import type { Metadata } from 'next';
import styles from './business.module.css';

export const metadata: Metadata = { title: 'İşletmeler için' };

const salesPhone = process.env.NEXT_PUBLIC_SALES_PHONE;

export default function BusinessPage() {
  return (
    <div className="container narrow">
      <section className={styles.hero}>
        <p className={styles.kicker}>İşletmeler için</p>
        <h1 className={styles.title}>Telefona bakamadığınızda bile randevu kaçırmayın.</h1>
        <ul className={styles.benefits}>
          <li>Müşterileriniz boş saatleri görüp kendileri randevu oluşturur.</li>
          <li>Her yeni randevu telefonunuza alarm gibi gelir; tek dokunuşla onaylarsınız.</li>
          <li>Salonunuz haritada görünür; yeni müşteriler sizi bulur.</li>
        </ul>
      </section>

      <section id="sahip" className={`card ${styles.entry}`}>
        <h2>Salon Sahibi Girişi</h2>
        <p>
          Salonunuzu, ekibinizi, hizmet ve fiyatlarınızı, çalışma saatlerini ve tüm randevuları uygulamadan yönetin. Giriş,
          salon sahibi olarak kayıtlı telefon numaranızla SMS kodu ile yapılır.
        </p>
        <AppBadges />
      </section>

      <section id="calisan" className={`card ${styles.entry}`}>
        <h2>Çalışan Girişi</h2>
        <p>
          Kendi takviminizi ve randevu taleplerinizi görün, yeni randevularda alarm alın. Giriş, salonunuzun sizi eklediği
          telefon numarasıyla SMS kodu ile yapılır.
        </p>
        <AppBadges />
      </section>

      <section id="basvuru" className={styles.apply}>
        <h2>Salonunuzu ekleyin</h2>
        <p>Ekibimiz salonunuzu ziyaret eder; hizmetlerinizi, ekibinizi ve saatlerinizi birlikte kurarız.</p>
        {salesPhone ? (
          <a className="btn btn-primary" href={`tel:${salesPhone}`}>
            Bizi arayın
          </a>
        ) : (
          <p className="muted">İletişim bilgileri yakında burada olacak.</p>
        )}
      </section>
    </div>
  );
}

function AppBadges() {
  return (
    <div className={styles.badges}>
      <span className={styles.store}>Google Play · Yakında</span>
      <span className={styles.store}>App Store · Yakında</span>
    </div>
  );
}
