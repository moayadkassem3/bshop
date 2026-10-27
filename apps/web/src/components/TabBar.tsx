'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNewCancellations } from '@/lib/business';
import { useBusinessMode } from '@/lib/session';
import styles from './TabBar.module.css';

const TABS = [
  {
    href: '/',
    label: 'Keşfet',
    icon: <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" />,
  },
  {
    href: '/randevularim',
    label: 'Randevular',
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    href: '/favoriler',
    label: 'Favoriler',
    icon: (
      <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.7 3.1 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
    ),
  },
  // Business mode shows Geçmiş in place of Favoriler (v1.7).
  {
    href: '/gecmis',
    label: 'Geçmiş',
    business: true,
    icon: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
        <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
      </>
    ),
  },
  {
    href: '/profil',
    label: 'Profil',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
  },
];

/** Fixed bottom navigation: Keşfet · Randevular · Favoriler (Geçmiş for businesses) · Profil. */
export function TabBar() {
  const pathname = usePathname();
  const business = useBusinessMode();
  const cancellations = useNewCancellations(business);
  const tabs = TABS.filter((t) => (t.href === '/favoriler' ? !business : t.business ? business : true));
  return (
    <nav className={styles.bar} aria-label="Ana menü">
      {tabs.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`${styles.tab} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
            <span className={styles.icon}>
              {tab.href === '/gecmis' && cancellations > 0 && (
                <span className={styles.badge} aria-label={`${cancellations} yeni iptal`}>
                  {cancellations}
                </span>
              )}
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                {tab.icon}
              </svg>
            </span>
            <span className={styles.label}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
