import Link from 'next/link';
import styles from './BusinessEntrances.module.css';

/** Owners and staff have separate entrances (handoff 2, v1.2). */
export function BusinessEntrances() {
  return (
    <section className={styles.section} aria-labelledby="business-title">
      <h2 id="business-title" className={styles.title}>
        Salonda mı çalışıyorsunuz?
      </h2>
      <div className={styles.grid}>
        <Link href="/isletmeler#sahip" className={styles.entry}>
          <span className={styles.icon} aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
          </span>
          <span>
            <span className={styles.kicker}>Salon sahibi misiniz?</span>
            <span className={styles.name}>Salon Sahibi Girişi</span>
          </span>
          <span className={styles.arrow} aria-hidden>
            →
          </span>
        </Link>
        <Link href="/isletmeler#calisan" className={styles.entry}>
          <span className={styles.icon} aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </span>
          <span>
            <span className={styles.kicker}>Salonda çalışıyor musunuz?</span>
            <span className={styles.name}>Çalışan Girişi</span>
          </span>
          <span className={styles.arrow} aria-hidden>
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
