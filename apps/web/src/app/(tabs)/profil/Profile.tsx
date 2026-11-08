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
import { VerifiedTick } from '@/components/VerifiedTick';
import { FORWARD, TAB } from '@/lib/motion';
import { useCanSell } from '@/lib/store';
import { AppearanceSwitch } from '@/components/AppearanceSwitch';
import { Icon, type IconName } from '@/components/Icon';
import { StaffPhotoPicker } from '@/components/StaffAvatar';

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
    if (next && isOwnPath(next)) return router.push(next);
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
        <Link transitionTypes={FORWARD} href="/isletmeler" className={styles.businessLink}>
          <span>İşletmeyim</span> Salonumu kaydetmek istiyorum ›
        </Link>
        <h2 className={styles.groupTitle}>Görünüm</h2>
        <AppearanceSwitch />
      </div>
    </div>
  );
}

function Account({ me, onChange }: { me: Me; onChange: (me: Me | null) => void }) {
  const canSell = useCanSell();
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
      setMessage(err instanceof ApiError && err.code === 'NOT_BUSINESS' ? 'Bu numara henüz bir işletmeye kayıtlı değil. Aşağıdan işletmenizi kaydedebilirsiniz.' : errorMessage(err));
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
        <h1 className={styles.accountName}>
          {name || 'Hesabım'}
          {me.verified && <VerifiedTick kind="customer" size={20} />}
        </h1>
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
              <MenuLink href="/randevularim" icon="randevular" label="Randevu ve taleplerim" />
              <MenuLink href="/favoriler" icon="favoriler" label="Favorilerim" />
            </ul>
          </>
        )}

        <h2 className={styles.groupTitle}>Hesap</h2>
        <ul className={`card ${styles.menu}`} role="list">
          <li>
            <button type="button" className={styles.menuItem} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <MenuLabel icon="edit" label="Profili düzenle" />
              <Icon name="chevron" size={18} className={`${styles.chevron} ${editing ? styles.chevronOpen : ''}`} />
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
          {!me.owns_shop && <MenuLink href="/isletme-kaydi" icon="salonum" label="İşletmenizi kaydedin" />}
          {me.owns_shop && <MenuLink href="/abonelik" icon="card" label="Aboneliğim" />}
          {canSell === true && <MenuLink href="/isletmeler" icon="card" label="Paketler ve fiyatlar" />}
          <MenuLink href="/sozlesmeler" icon="doc" label="Yasal metinler" />
          {/* Our team only (v1.7). */}
          {me.is_platform_admin && <MenuLink href="/yonetim" icon="settings" label="Yönetim paneli" />}
        </ul>
        {message && <p className="alert alert-info">{message}</p>}

        <h2 className={styles.groupTitle}>Görünüm</h2>
        <AppearanceSwitch />

        {/* Switching mode is its own action, kept apart from the settings list; sign-out stays last. */}
        {(mode !== 'customer' || me.has_business) && (
          <button type="button" className={styles.switchMode} onClick={() => switchMode(mode === 'customer' ? 'business' : 'customer')} disabled={busy}>
            <Icon name="swap" size={20} strokeWidth={2} />
            {mode === 'customer' ? 'İşletme moduna geç' : 'Müşteri moduna geç'}
          </button>
        )}

        <button
          type="button"
          className={styles.signOut}
          onClick={() => {
            // The session ends on the server too (v1.7, security); the screen does not wait for it.
            api('/auth/logout', { method: 'POST' }).catch(() => undefined);
            setToken(null);
            onChange(null);
          }}
        >
          Çıkış yap
        </button>
        {/* Deliberately quiet (founder, v1.7): available, as the app stores require, but not a main action. */}
        <Link transitionTypes={FORWARD} href="/hesabi-sil" className={styles.deleteLink}>
          Hesabı sil
        </Link>
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
  verified?: boolean;
  member_id: string;
  display_name: string;
  photo_id: string | null;
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
/**
 * The salons this person belongs to, with their role and review/trial state.
 * Everything about a salon lives on Salonum (v1.7); a row opens it on that salon.
 * Profil keeps what is about the person: details, plans, mode, legal, sign-out.
 */
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
              <Link transitionTypes={TAB} href="/salonum" className={`${styles.menuItem} ${styles.business}`} onClick={() => rememberShop(b.id)}>
                <span className={styles.menuLabel}>
                  <span className={styles.menuIcon}>
                    <Icon name="salonum" size={20} />
                  </span>
                  <span className={styles.businessText}>
                    <strong>
                      {b.name}
                      {b.verified && <VerifiedTick kind="salon" size={14} />}
                    </strong>
                    <span className="muted">{label}</span>
                  </span>
                </span>
                <span className={styles.businessEnd}>
                  <span className={`badge ${status.tone}`}>{status.label}</span>
                  <Icon name="chevron" size={18} className={styles.chevron} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Staff photos (founder, 8 November 2026): one photo for every salon the person works at. */}
      {shops.length > 0 && (
        <>
          <h2 className={styles.groupTitle}>Profil fotoğrafım</h2>
          <div className={`card ${styles.photoCard}`}>
            <StaffPhotoPicker
              name={shops[0]!.display_name}
              photoId={shops[0]!.photo_id}
              targets={shops.map((b) => ({ shopId: b.id, memberId: b.member_id }))}
              onChange={(photoId) => setShops((list) => list && list.map((b) => ({ ...b, photo_id: photoId })))}
            />
            <p className={styles.photoHint}>Müşteriler salonunuzun sayfasında ve randevu alırken sizi bu fotoğrafla görür.</p>
          </div>
        </>
      )}
    </>
  );
}

/** A menu row like the app's: the icon in a soft blue square, the label, a chevron. */
function MenuLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <li>
      <Link transitionTypes={FORWARD} href={href} className={styles.menuItem}>
        <MenuLabel icon={icon} label={label} />
        <Icon name="chevron" size={18} className={styles.chevron} />
      </Link>
    </li>
  );
}

function MenuLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span className={styles.menuLabel}>
      <span className={styles.menuIcon}>
        <Icon name={icon} size={20} />
      </span>
      {label}
    </span>
  );
}

/**
 * Security (v1.7): only a page on this site is a valid "devam" target. "/\\evil.com"
 * or "//evil.com" would otherwise send someone to another site right after sign-in.
 */
function isOwnPath(next: string): boolean {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return false;
  try {
    return new URL(next, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
