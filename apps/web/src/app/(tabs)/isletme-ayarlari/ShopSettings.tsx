'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useBusinessShops } from '@/lib/business';
import styles from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import { SalonTab } from './SalonTab';
import { ServicesTab } from './ServicesTab';
import { StaffTab } from './StaffTab';
import own from './settings.module.css';

const TABS = [
  { key: 'salon', label: 'Salon' },
  { key: 'hizmetler', label: 'Hizmetler' },
  { key: 'personel', label: 'Personel' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * Salon bilgileri (v1.7), for owners and co-owners, in three tabs: Salon
 * (details, address, photos), Hizmetler (services and prices), Personel (team).
 * The tab is kept in the address (#hizmetler) so it survives a reload.
 */
export function ShopSettings() {
  const { shops, shop, shopId, selectShop, error } = useBusinessShops();
  const [tab, setTab] = useState<Tab>('salon');

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.key === fromHash)) setTab(fromHash as Tab);
  }, []);

  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <header className={`page-header ${styles.header}`}>
        <div className="container narrow">
          <Link href="/profil" className={own.back}>
            ← Profil
          </Link>
          <h1>Salon bilgileri</h1>
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
          <div className={`${styles.segmented} ${own.tabs}`} role="tablist" aria-label="Bölümler">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? styles.segOn : ''} onClick={() => choose(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`container narrow ${styles.body} ${own.page}`}>
        {error && <p className="alert alert-danger">{error}</p>}
        {shop && shop.role !== 'owner' && <p className="alert alert-info">Salon bilgilerini yalnızca salon sahibi ve ortaklar değiştirebilir.</p>}
        {shop && shop.role === 'owner' && (
          // Remounted per salon; tabs stay mounted so unsaved changes survive switching.
          <div key={shop.id}>
            <SalonTab shopId={shop.id} slug={shop.slug} visible={tab === 'salon'} />
            <ServicesTab shopId={shop.id} visible={tab === 'hizmetler'} />
            <StaffTab shopId={shop.id} myMemberId={shop.member_id} visible={tab === 'personel'} />
          </div>
        )}
      </div>
    </>
  );
}
