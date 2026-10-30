'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandName, LogoMark } from '@/components/Logo';
import { GenderChoice, PhoneSignIn } from '@/components/PhoneSignIn';
import { api, ApiError, errorMessage } from '@/lib/api';
import { daysLeft, rememberShop } from '@/lib/business';
import { formatPhone } from '@/lib/shop';
import { getToken, rememberPortal, setToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import styles from './profile.module.css';

const MODE_LABEL = { customer: 'Müşteri', owner: 'İşletme sahibi', staff: 'Personel' } as const;

/** Profil tab: one sign-in for everyone (v1.7), the account, and switching modes. */
export function Profile() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) return setMe(null);
    api<Me>('/me')
      .then((m) => {
        rememberPortal(m.portal);
        setMe(m);
      })
      .catch(() => {
        setToken(null);
        setMe(null);
      });
  }, []);

  // Shortcuts such as Randevular's "Giriş yap" send people here with ?devam=/page and get them back after.
  function signedIn(m: Me) {
    const next = new URLSearchParams(window.location.search).get('devam');
    if (next?.startsWith('/') && !next.startsWith('//')) return router.push(next);
    setMe(m);
  }

  if (me === undefined) return null;
  return me ? <Account me={me} onChange={setMe} /> : <SignIn onSignedIn={signedIn} />;
}

/**
 * One sign-in for everyone (v1.7): the phone number, then the SMS code. People
 * who work at a salon choose after the code whether to continue as the business
 * or as a customer; salon owners who are not with us yet have a link below.
 */
function SignIn(props: { onSignedIn: (me: Me) => void }) {
  return (
    <div className={styles.signInPage}>
      <div className={styles.hero}>
        <span className={styles.heroMark} aria-hidden>
          <LogoMark size={52} />
        </span>
        <h1 className={styles.brand}>
          <BrandName />
        </h1>
        <p className={styles.tagline}>Kuaförünü bul, randevunu hemen al.</p>
      </div>

      <div className={styles.sheet}>
        <h2 className={styles.sheetTitle}>Giriş yap</h2>
        <PhoneSignIn as="customer" chooseMode onSignedIn={props.onSignedIn} />
        <Link href="/isletmeler" className={styles.businessLink}>
          <span>İşletmeyim</span> Salonumu kaydetmek istiyorum ›
        </Link>
      </div>
    </div>
  );
}

function Account({ me, onChange }: { me: Me; onChange: (me: Me | null) => void }) {
  const [editing, setEditing] = useState(!me.first_name);
  const [firstName, setFirstName] = useState(me.first_name ?? '');
  const [lastName, setLastName] = useState(me.last_name ?? '');
  const [gender, setGender] = useState(me.gender ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = me.portal ?? 'customer';
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ');

  async function saveName() {
    setBusy(true);
    try {
      const updated = await api<Me>('/me', { method: 'PATCH', body: { firstName, lastName, gender } });
      onChange({ ...me, ...updated });
      setEditing(false);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function switchMode(to: 'customer' | 'business') {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to } });
      setToken(r.token, r.user.portal);
      onChange({ ...me, ...r.user });
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.code === 'NOT_BUSINESS'
          ? 'Bu numara henüz bir işletmeye kayıtlı değil. Aşağıdan işletmenizi kaydedebilirsiniz.'
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className={styles.accountHeader}>
        <span className={styles.avatar} aria-hidden>
          {(me.first_name ?? me.phone.slice(-2))[0]?.toLocaleUpperCase('tr')}
        </span>
        <h1 className={styles.accountName}>{name || 'Hesabım'}</h1>
        <p className={styles.accountPhone}>{formatPhone(me.phone)}</p>
        <span className={styles.modeBadge}>{MODE_LABEL[mode]}</span>
      </header>

      <div className="container narrow">
        {mode !== 'customer' && <MyBusinesses />}

        {/* Favorites are a customer thing; in business mode the salon's tools above take their place. */}
        {mode === 'customer' && (
          <>
            <h2 className={styles.groupTitle}>İşlemlerim</h2>
            <ul className={`card ${styles.menu}`} role="list">
              <MenuLink href="/randevularim" label="Randevu ve taleplerim" />
              <MenuLink href="/favoriler" label="Favorilerim" />
            </ul>
          </>
        )}

        <h2 className={styles.groupTitle}>Hesap</h2>
        <ul className={`card ${styles.menu}`} role="list">
          <li>
            <button type="button" className={styles.menuItem} onClick={() => setEditing((e) => !e)}>
              Profili düzenle <span aria-hidden>›</span>
            </button>
            {editing && (
              <div className={styles.nameForm}>
                <div className="field">
                  <label htmlFor="p-first">Ad</label>
                  <input id="p-first" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="p-last">Soyad</label>
                  <input id="p-last" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <GenderChoice value={gender} onChange={setGender} />
                <button type="button" className="btn btn-primary" disabled={busy || !firstName.trim() || !lastName.trim()} onClick={saveName}>
                  Kaydet
                </button>
              </div>
            )}
          </li>
          {/* Salon owners edit their salon from its card in İşletmelerim instead (v1.7). */}
          {!me.owns_shop && <MenuLink href="/isletme-kaydi" label="İşletmenizi kaydedin" />}
          <MenuLink href="/isletmeler" label="Paketler ve fiyatlar" />
          <MenuLink href="/sozlesmeler" label="Yasal metinler" />
        </ul>
        {message && <p className="alert alert-info">{message}</p>}

        {/* Switching mode is its own action, kept apart from the settings list; sign-out stays last. */}
        {(mode !== 'customer' || me.has_business) && (
          <button type="button" className={styles.switchMode} onClick={() => switchMode(mode === 'customer' ? 'business' : 'customer')} disabled={busy}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
            </svg>
            {mode === 'customer' ? 'İşletme moduna geç' : 'Müşteri moduna geç'}
          </button>
        )}

        <button
          type="button"
          className={styles.signOut}
          onClick={() => {
            setToken(null);
            onChange(null);
          }}
        >
          Çıkış yap
        </button>
      </div>
    </>
  );
}

type MyBusiness = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'staff';
  owner_label: 'owner' | 'co_owner' | null;
  reviewed_at: string | null;
  subscription_status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
  visible: boolean;
};

function businessStatus(b: MyBusiness): { label: string; tone: string } {
  if (!b.reviewed_at) return { label: 'İncelemede', tone: 'badge-warning' };
  if (b.subscription_status === 'trial' && b.current_period_end) {
    const days = daysLeft(b.current_period_end);
    return days ? { label: `Deneme · ${days} gün kaldı`, tone: 'badge-info' } : { label: 'Deneme bitti', tone: 'badge-danger' };
  }
  if (b.subscription_status === 'active') return { label: 'Aktif', tone: 'badge-success' };
  if (b.subscription_status === 'past_due') return { label: 'Ödeme bekleniyor', tone: 'badge-danger' };
  return { label: 'Pasif', tone: 'badge-muted' };
}

/** The shops this person belongs to, with their label (v1.6: owner, co-owner, staff) and review/trial state. */
function MyBusinesses() {
  const [shops, setShops] = useState<MyBusiness[] | null>(null);
  useEffect(() => {
    api<MyBusiness[]>('/staff/shops')
      .then(setShops)
      .catch(() => setShops([]));
  }, []);
  if (!shops) return null;
  return (
    <>
      <h2 className={styles.groupTitle}>İşletmelerim</h2>
      <ul className={`card ${styles.menu}`} role="list">
        {shops.map((b) => {
          const status = businessStatus(b);
          const label = b.role === 'staff' ? 'Personel' : b.owner_label === 'co_owner' ? 'Ortak' : 'Sahibi';
          return (
            <li key={b.id}>
              <div className={styles.business}>
                <span>
                  <strong>{b.name}</strong>
                  <span className="muted">{label}</span>
                </span>
                <span className={`badge ${status.tone}`}>{status.label}</span>
              </div>
              {b.role === 'owner' && (
                <Link href="/isletme-ayarlari" className={`${styles.menuItem} ${styles.editShop}`} onClick={() => rememberShop(b.id)}>
                  Salon bilgilerini düzenle <span aria-hidden>›</span>
                </Link>
              )}
              {/* The salon's public page, as customers see it (v1.7); it exists once our team approves the salon. */}
              {b.reviewed_at && b.visible ? (
                <Link href={`/${b.slug}`} className={`${styles.menuItem} ${styles.editShop}`}>
                  Salonu müşteri gözüyle gör <span aria-hidden>›</span>
                </Link>
              ) : (
                <span className={`${styles.menuItem} ${styles.editShop} ${styles.pendingView}`}>
                  {b.reviewed_at ? 'Salon sayfası abonelik başlayana kadar kapalı' : 'Salon sayfası onaydan sonra açılır'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/randevularim" className={`btn btn-primary btn-block ${styles.panelLink}`}>
        Randevu talepleri ve takvim
      </Link>
      <Link href="/calismalar" className={`btn btn-block ${styles.panelLink}`}>
        Kesim fotoğrafı paylaş
      </Link>
      {shops.some((b) => b.role === 'owner') && (
        <>
          <Link href="/istatistikler" className={`btn btn-block ${styles.panelLink}`}>
            İstatistikler
          </Link>
          <Link href="/qr" className={`btn btn-block ${styles.panelLink}`}>
            Salon QR kodu
          </Link>
        </>
      )}
    </>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className={styles.menuItem}>
        {label} <span aria-hidden>›</span>
      </Link>
    </li>
  );
}
