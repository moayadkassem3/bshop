'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PhoneSignIn } from '@/components/PhoneSignIn';
import { api, ApiError, errorMessage } from '@/lib/api';
import { BRAND } from '@/lib/config';
import { formatPhone } from '@/lib/shop';
import { getToken, setToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import styles from './profile.module.css';

const MODE_LABEL = { customer: 'Müşteri', owner: 'İşletme sahibi', staff: 'Personel' } as const;

/** Profil tab: sign-in as customer or business (v1.5), the account, and switching modes. */
export function Profile() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [choice, setChoice] = useState<'customer' | 'business' | null>(null);

  useEffect(() => {
    if (!getToken()) return setMe(null);
    api<Me>('/me')
      .then(setMe)
      .catch(() => {
        setToken(null);
        setMe(null);
      });
  }, []);

  if (me === undefined) return null;
  return me ? <Account me={me} onChange={setMe} /> : <SignIn choice={choice} onChoice={setChoice} onSignedIn={setMe} />;
}

function SignIn(props: {
  choice: 'customer' | 'business' | null;
  onChoice: (c: 'customer' | 'business' | null) => void;
  onSignedIn: (me: Me) => void;
}) {
  return (
    <div className={styles.signInPage}>
      <div className={styles.hero}>
        <span className={styles.heroMark} aria-hidden>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
          </svg>
        </span>
        <h1 className={styles.brand}>{BRAND}</h1>
        <p className={styles.tagline}>Kuaförünü bul, randevunu hemen al.</p>
      </div>

      <div className={styles.sheet}>
        {props.choice === null && (
          <>
            <h2 className={styles.sheetTitle}>Nasıl devam etmek istersin?</h2>
            <button type="button" className={`${styles.choice} ${styles.choicePrimary}`} onClick={() => props.onChoice('customer')}>
              <span className={styles.choiceIcon} aria-hidden>
                <PersonIcon />
              </span>
              <span className={styles.choiceText}>
                <strong>Müşteriyim</strong>
                <span>Kuaför arıyorum</span>
              </span>
              <span aria-hidden>›</span>
            </button>
            <button type="button" className={styles.choice} onClick={() => props.onChoice('business')}>
              <span className={`${styles.choiceIcon} ${styles.choiceIconDark}`} aria-hidden>
                <ScissorsIcon />
              </span>
              <span className={styles.choiceText}>
                <strong>İşletmeyim</strong>
                <span>Hizmet vermek istiyorum</span>
              </span>
              <span aria-hidden>›</span>
            </button>
          </>
        )}

        {props.choice === 'customer' && (
          <>
            <button type="button" className={styles.back} onClick={() => props.onChoice(null)}>
              ← Geri
            </button>
            <h2 className={styles.sheetTitle}>Müşteri girişi</h2>
            <PhoneSignIn askNames as="customer" onSignedIn={props.onSignedIn} />
          </>
        )}

        {props.choice === 'business' && (
          <>
            <button type="button" className={styles.back} onClick={() => props.onChoice(null)}>
              ← Geri
            </button>
            <h2 className={styles.sheetTitle}>İşletme girişi</h2>
            <p className={styles.hint}>İşletme sahibi veya personel olarak kayıtlı telefon numaranızla girin.</p>
            <PhoneSignIn askNames={false} as="business" onSignedIn={props.onSignedIn} />
            <div className={styles.register}>
              <span>İşletmeniz henüz kayıtlı değil mi?</span>
              <Link href="/isletmeler#basvuru">İşletmenizi kaydedin →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Account({ me, onChange }: { me: Me; onChange: (me: Me | null) => void }) {
  const [editing, setEditing] = useState(!me.first_name);
  const [firstName, setFirstName] = useState(me.first_name ?? '');
  const [lastName, setLastName] = useState(me.last_name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = me.portal ?? 'customer';
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ');

  async function saveName() {
    setBusy(true);
    try {
      const updated = await api<Me>('/me', { method: 'PATCH', body: { firstName, lastName } });
      onChange(updated);
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
      setToken(r.token);
      onChange(r.user);
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
        {mode !== 'customer' && (
          <div className={`card ${styles.panelNote}`}>
            <strong>İşletme paneli</strong>
            <p className="muted">Randevu talepleri, takvim, hizmetler ve ayarlar çok yakında burada olacak.</p>
          </div>
        )}

        <h2 className={styles.groupTitle}>İşlemlerim</h2>
        <ul className={`card ${styles.menu}`} role="list">
          <MenuLink href="/randevularim" label="Randevu ve taleplerim" />
          <MenuLink href="/favoriler" label="Favorilerim" />
        </ul>

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
                <button type="button" className="btn btn-primary" disabled={busy || !firstName.trim() || !lastName.trim()} onClick={saveName}>
                  Kaydet
                </button>
              </div>
            )}
          </li>
          <li>
            {mode === 'customer' ? (
              <button type="button" className={`${styles.menuItem} ${styles.highlight}`} onClick={() => switchMode('business')} disabled={busy}>
                İşletme hesabına geç <span aria-hidden>›</span>
              </button>
            ) : (
              <button type="button" className={styles.menuItem} onClick={() => switchMode('customer')} disabled={busy}>
                Müşteri moduna geç <span aria-hidden>›</span>
              </button>
            )}
          </li>
          <MenuLink href="/isletmeler" label="İşletmenizi kaydedin" />
        </ul>
        {message && <p className="alert alert-info">{message}</p>}

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

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className={styles.menuItem}>
        {label} <span aria-hidden>›</span>
      </Link>
    </li>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </svg>
  );
}
