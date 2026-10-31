'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShareShop } from '@/components/ShareShop';
import { VerifiedTick } from '@/components/VerifiedTick';
import { api, errorMessage } from '@/lib/api';
import { formatTime, turkeyDate } from '@/lib/format';
import { rememberShop, useBusinessShops, type ShopAppointment } from '@/lib/business';
import page from '../randevularim/appointments.module.css';
import biz from '../randevularim/business.module.css';
import styles from './salonum.module.css';

const LIVE = new Set<ShopAppointment['status']>(['pending', 'offered', 'confirmed']);

/**
 * Salonum (v1.7): the first tab in business mode. Today at a glance (requests
 * waiting, the day's appointments) and the salon's shortcuts: its page,
 * sharing, the map, QR code, statistics, photos, settings.
 */
export function Salonum() {
  const { shops, shop, shopId, selectShop, error: shopsError } = useBusinessShops();
  const [items, setItems] = useState<ShopAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const owner = shop?.role === 'owner';

  useEffect(() => {
    if (!shopId) return;
    let stopped = false;
    const load = () => {
      const from = new Date(`${turkeyDate(new Date())}T00:00:00+03:00`);
      const to = new Date(Date.now() + 365 * 86_400_000);
      api<ShopAppointment[]>(`/staff/shops/${shopId}/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)
        .then((list) => !stopped && (setItems(list), setError(null)))
        .catch((err) => !stopped && setError(errorMessage(err)));
    };
    load();
    // New requests arrive without a reload, as on Randevular.
    const timer = setInterval(load, 30_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [shopId]);

  const now = Date.now();
  const today = turkeyDate(new Date());
  const waiting = (items ?? []).filter((a) => a.status === 'pending');
  const todays = (items ?? []).filter((a) => LIVE.has(a.status) && turkeyDate(new Date(a.starts_at)) === today);
  const next = todays.filter((a) => new Date(a.ends_at).getTime() > now).slice(0, 5);

  return (
    <>
      <header className={`page-header ${page.header}`}>
        <div className="container narrow">
          <h1>Salonum</h1>
          {shops && shops.length > 1 ? (
            <select className={biz.shopSelect} value={shopId ?? ''} aria-label="İşletme" onChange={(e) => selectShop(e.target.value)}>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            shop && (
              <p className={styles.shopName}>
                {shop.name}
                {shop.verified && <VerifiedTick kind="salon" size={16} />}
              </p>
            )
          )}
        </div>
      </header>

      <div className={`container narrow ${page.body} ${styles.page}`}>
        {(shopsError || error) && <p className="alert alert-danger">{shopsError || error}</p>}
        {shops && shops.length === 0 && <p className="muted">Bu hesap henüz bir işletmeye bağlı değil.</p>}

        {shop && (
          <>
            <section aria-labelledby="today-title" className={styles.section}>
              <h2 id="today-title">Bugün</h2>
              <div className={styles.tiles}>
                <Link href="/randevularim" className={`card ${styles.tile} ${waiting.length ? styles.tileAlert : ''}`}>
                  <span className={styles.tileValue}>{items ? waiting.length : '–'}</span>
                  <span className={styles.tileLabel}>Bekleyen talep</span>
                </Link>
                <Link href="/randevularim" className={`card ${styles.tile}`}>
                  <span className={styles.tileValue}>{items ? todays.length : '–'}</span>
                  <span className={styles.tileLabel}>Bugünkü randevu</span>
                </Link>
              </div>
              {items && (
                <div className={`card ${styles.next}`}>
                  <p className={styles.nextTitle}>Sıradaki randevular</p>
                  {next.length === 0 ? (
                    <p className="muted">Bugün başka randevu yok.</p>
                  ) : (
                    <ul role="list">
                      {next.map((a) => (
                        <li key={a.id}>
                          <span className={styles.nextTime}>{formatTime(a.starts_at)}</span>
                          <span className={styles.nextText}>
                            <strong>{a.guest_name ?? a.customer_name}</strong>
                            <span>
                              {(a.services ?? []).map((s) => s.name).join(' + ')}
                              {owner ? ` · ${a.staff_name}` : ''}
                            </span>
                          </span>
                          {a.status !== 'confirmed' && <span className="badge badge-warning">{a.status === 'pending' ? 'Onay bekliyor' : 'Öneri'}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/randevularim" className={styles.more}>
                    Talepler ve takvim ›
                  </Link>
                </div>
              )}
            </section>

            <section aria-labelledby="salon-title" className={styles.section}>
              <h2 id="salon-title">Salonunuz</h2>
              {shop.reviewed_at && shop.visible ? (
                <div className={styles.primary}>
                  <Link href={`/${shop.slug}`} className="btn btn-primary">
                    Müşteri gözüyle gör
                  </Link>
                  <ShareShop shop={shop} onDone={setNote} />
                </div>
              ) : (
                <p className={`card ${styles.closed}`}>
                  {shop.reviewed_at ? 'Salon sayfanız abonelik başlayana kadar müşterilere kapalı.' : 'Salon sayfanız onaydan sonra açılır.'}
                </p>
              )}
              {note && (
                <p className="muted" role="status">
                  {note}
                </p>
              )}
              <ul className={`card ${styles.links}`} role="list">
                <ShortcutLink href="/?harita" icon="map" label="Haritada gör" hint="Salonunuz ve çevredeki salonlar" />
                {owner && <ShortcutLink href="/qr" icon="qr" label="QR kod" hint="Salonunuza asın, müşteriler okutup randevu alsın" />}
                {owner && <ShortcutLink href="/istatistikler" icon="chart" label="İstatistikler" hint="Sayfa ziyaretleri ve randevular, ay ay" />}
                <ShortcutLink href="/calismalar" icon="camera" label="Kesim fotoğrafı paylaş" hint="Popüler kesimler’de görünür" />
                {owner && (
                  <ShortcutLink
                    href="/isletme-ayarlari"
                    icon="settings"
                    label="Salon bilgileri"
                    hint="Adres, fotoğraflar, hizmetler, personel"
                    onClick={() => rememberShop(shop.id)}
                  />
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}

/** Line icons in the same style as the tab bar (24-unit grid, 1.8 stroke). */
const ICONS = {
  map: <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20" />,
  qr: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h2M20.5 14v2" />
    </>
  ),
  chart: <path d="M4 20h16M7.5 17v-6M12 17V5M16.5 17V9" strokeWidth="2.2" />,
  camera: (
    <>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
};

function ShortcutLink(props: { href: string; icon: keyof typeof ICONS; label: string; hint?: string; onClick?: () => void }) {
  return (
    <li>
      <Link href={props.href} className={styles.link} onClick={props.onClick}>
        <span className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[props.icon]}
          </svg>
        </span>
        <span className={styles.linkText}>
          <strong>{props.label}</strong>
          {props.hint && <span>{props.hint}</span>}
        </span>
        <span aria-hidden>›</span>
      </Link>
    </li>
  );
}
