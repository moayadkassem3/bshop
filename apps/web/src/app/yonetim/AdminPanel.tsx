'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import { LogoMark } from '@/components/Logo';
import { SkeletonList } from '@/components/Skeleton';
import { OverviewTab } from './OverviewTab';
import { SalonsTab } from './SalonsTab';
import { RequestsTab } from './RequestsTab';
import { RatingsTab } from './RatingsTab';
import styles from './admin.module.css';

const TABS = [
  { key: 'ozet', label: 'Özet' },
  { key: 'salonlar', label: 'Salonlar' },
  { key: 'talepler', label: 'Talepler' },
  { key: 'puanlar', label: 'Değerlendirmeler' },
] as const;
export type AdminTab = (typeof TABS)[number]['key'];

/**
 * Yönetim (v1.7): our team's panel. Salons go live when they register; here we
 * follow the business, record payments, and take down spam. Only accounts in
 * ADMIN_PHONES can open it.
 */
export function AdminPanel() {
  const [me, setMe] = useState<Me | null | false>(null);
  const [tab, setTab] = useState<AdminTab>('ozet');
  // Opening a salon from another tab (e.g. a request) or with a filter from Özet.
  const [salonId, setSalonId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('tumu');

  useEffect(() => {
    if (!getToken()) return setMe(false);
    api<Me>('/me')
      .then(setMe)
      .catch(() => setMe(false));
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.key === fromHash)) setTab(fromHash as AdminTab);
  }, []);

  function choose(next: AdminTab) {
    setTab(next);
    setSalonId(null);
    window.history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0 });
  }

  const openSalon = (id: string) => {
    setSalonId(id);
    setTab('salonlar');
    window.history.replaceState(null, '', '#salonlar');
    window.scrollTo({ top: 0 });
  };
  const openFilter = (f: string) => {
    setFilter(f);
    choose('salonlar');
  };

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Link href="/" className={styles.brand}>
            <LogoMark size={30} />
            <span>Yönetim</span>
          </Link>
          {me && me.is_platform_admin && (
            <nav className={styles.tabs} aria-label="Bölümler">
              {TABS.map((t) => (
                <button key={t.key} type="button" aria-current={tab === t.key ? 'page' : undefined} className={tab === t.key ? styles.tabOn : ''} onClick={() => choose(t.key)}>
                  {t.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {me === null && <SkeletonList rows={3} />}
        {me === false && (
          <div className={`card ${styles.notice}`}>
            <h1>Yönetim paneli</h1>
            <p>Devam etmek için ekip telefon numaranızla giriş yapın.</p>
            <Link href="/profil?devam=/yonetim" className="btn btn-primary">
              Giriş yap
            </Link>
          </div>
        )}
        {me && !me.is_platform_admin && (
          <div className={`card ${styles.notice}`}>
            <h1>Yönetim paneli</h1>
            <p>Bu sayfa yalnızca ekibimiz içindir.</p>
            <Link href="/" className="btn">
              Ana sayfa
            </Link>
          </div>
        )}
        {me && me.is_platform_admin && (
          <>
            {tab === 'ozet' && <OverviewTab onFilter={openFilter} onTab={choose} />}
            {tab === 'salonlar' && <SalonsTab filter={filter} onFilter={setFilter} salonId={salonId} onSalon={setSalonId} />}
            {tab === 'talepler' && <RequestsTab onSalon={openSalon} />}
            {tab === 'puanlar' && <RatingsTab />}
          </>
        )}
      </main>
    </div>
  );
}
