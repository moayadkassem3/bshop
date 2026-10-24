import Link from 'next/link';
import { BusinessEntrances } from '@/components/BusinessEntrances';
import { SearchBox } from '@/components/SearchBox';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className="container">
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Berber · Kuaför · İstanbul</p>
        <h1 className={styles.title}>Randevunuzu arayıp beklemeden alın.</h1>
        <p className={styles.lead}>
          Ustanız müşteriyle meşgulken bile boş saatleri görün ve randevunuzu oluşturun. Uygulama indirmenize gerek yok.
        </p>
        <div className={styles.search}>
          <SearchBox />
          <Link href="/harita" className="btn">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            Haritada salon bul
          </Link>
        </div>
      </section>

      <section className={styles.steps} aria-label="Nasıl çalışır">
        {[
          ['1', 'Hizmetinizi seçin', 'Fiyatları ve süreleri baştan görün.'],
          ['2', 'Ustanızı ve saati seçin', 'Ya da “Fark etmez” deyin, ilk müsait usta atansın.'],
          ['3', 'Onayınızı alın', 'Salon en geç 15 dakika içinde onaylar; sonuç SMS ile gelir.'],
        ].map(([n, title, text]) => (
          <div key={n} className={styles.step}>
            <span className={styles.stepNumber}>{n}</span>
            <div>
              <h2 className={styles.stepTitle}>{title}</h2>
              <p className={styles.stepText}>{text}</p>
            </div>
          </div>
        ))}
      </section>

      <BusinessEntrances />
    </div>
  );
}
