'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppointmentStatus } from '@/components/AppointmentStatus';
import { PhoneSignIn } from '@/components/PhoneSignIn';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatLongDate, formatPrice, formatTime } from '@/lib/format';
import { getToken, setToken } from '@/lib/session';
import type { CustomerAppointment } from '@/lib/types';
import styles from './appointments.module.css';

export function MyAppointments() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<CustomerAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<CustomerAppointment[]>('/me/appointments'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setSignedIn(false);
      } else setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const has = Boolean(getToken());
    setSignedIn(has);
    if (has) load();
  }, [load]);

  // Keep pending requests fresh until the shop answers.
  useEffect(() => {
    if (!items?.some((a) => a.status === 'pending')) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [items, load]);

  if (signedIn === null) return <Header />;
  if (!signedIn) {
    return (
      <>
        <Header />
        <div className={`container narrow ${styles.body}`}>
          <div className={`card ${styles.signIn}`}>
            <p className="muted">Randevularınızı görmek için telefon numaranızı doğrulayın.</p>
            <PhoneSignIn
              onSignedIn={() => {
                setSignedIn(true);
                load();
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <List
      items={items}
      error={error}
      onChanged={load}
      onSignOut={() => {
        setToken(null);
        setItems(null);
        setSignedIn(false);
      }}
    />
  );
}

type Tab = 'appointments' | 'requests';
type When = 'upcoming' | 'past';

// Talepler: requests the salon has not answered yet, and declined ones. Randevular: everything the salon accepted.
const isRequest = (a: CustomerAppointment) => a.status === 'pending' || a.status === 'declined';
const isUpcoming = (a: CustomerAppointment, now: number) =>
  ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() > now;

const EMPTY: Record<Tab, Record<When, { title: string; text: string | null }>> = {
  appointments: {
    upcoming: { title: 'Yaklaşan randevun yok', text: 'Bir kuaför seçip randevu oluşturabilirsin.' },
    past: { title: 'Geçmiş randevun yok', text: 'Tamamlanan randevuların burada görünür.' },
  },
  requests: {
    upcoming: { title: 'Bekleyen talebin yok', text: 'Gönderdiğin talepler salon yanıtlayana kadar burada görünür.' },
    past: { title: 'Geçmiş talebin yok', text: null },
  },
};

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={`page-header ${styles.header}`}>
      <div className="container narrow">
        <h1>Randevular</h1>
        {children}
      </div>
    </header>
  );
}

function List(props: { items: CustomerAppointment[] | null; error: string | null; onChanged: () => void; onSignOut: () => void }) {
  const now = Date.now();
  const all = props.items ?? [];
  const waiting = all.filter((a) => a.status === 'pending' && isUpcoming(a, now)).length;
  const [tab, setTab] = useState<Tab | null>(null);
  const [when, setWhen] = useState<When>('upcoming');
  // A new request opens on Talepler, so it is the first thing the customer sees after booking.
  const shownTab: Tab = tab ?? (waiting && !all.some((a) => a.status === 'confirmed' && isUpcoming(a, now)) ? 'requests' : 'appointments');
  const shown = all.filter((a) => (shownTab === 'requests') === isRequest(a) && (when === 'upcoming') === isUpcoming(a, now));
  const empty = EMPTY[shownTab][when];

  return (
    <>
      <Header>
        <div className={styles.segmented} role="tablist" aria-label="Randevular veya talepler">
          {(['appointments', 'requests'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={shownTab === t} className={shownTab === t ? styles.segOn : ''} onClick={() => setTab(t)}>
              {t === 'appointments' ? 'Randevular' : 'Talepler'}
              {t === 'requests' && waiting > 0 && <span className={styles.count}>{waiting}</span>}
            </button>
          ))}
        </div>
      </Header>
      <div className={`container narrow ${styles.body}`}>
        <div className={styles.chips} role="radiogroup" aria-label="Zaman">
          {(['upcoming', 'past'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={when === w} className={`${styles.chip} ${when === w ? styles.chipOn : ''}`} onClick={() => setWhen(w)}>
              {w === 'upcoming' ? 'Yaklaşan' : 'Geçmiş'}
            </button>
          ))}
        </div>
        <div className={styles.wrap}>
          {props.error && <p className="alert alert-danger">{props.error}</p>}
          {props.items && shown.length === 0 && (
            <div className={`card ${styles.empty}`}>
              <span className={styles.emptyIcon} aria-hidden>
                <CalendarIcon />
              </span>
              <h2>{empty.title}</h2>
              {empty.text && <p>{empty.text}</p>}
              {shownTab === 'appointments' && when === 'upcoming' && (
                <Link href="/" className="btn btn-primary">
                  <MapIcon /> Kuaför keşfet
                </Link>
              )}
            </div>
          )}
          {shown.map((a) => (
            <AppointmentCard key={a.id} appointment={a} onChanged={props.onChanged} />
          ))}
          <button type="button" className={styles.signOut} onClick={props.onSignOut}>
            Çıkış yap
          </button>
        </div>
      </div>
    </>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function AppointmentCard({ appointment: a, onChanged }: { appointment: CustomerAppointment; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upcoming = ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() > Date.now();
  const late =
    a.status === 'confirmed' && new Date(a.starts_at).getTime() - Date.now() < a.cancellation_cutoff_minutes * 60_000;

  async function cancel() {
    setBusy(true);
    try {
      await api(`/me/appointments/${a.id}/cancel`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className={`card ${styles.card}`}>
      <div className={styles.cardTop}>
        <div>
          <p className={styles.when}>
            {formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}
          </p>
          <Link href={`/${a.shop_slug}`} className={styles.shop}>
            {a.shop_name}
          </Link>
          <p className="muted">
            {a.staff_name}
            {a.guest_name ? ` · ${a.guest_name} için` : ''}
          </p>
        </div>
        <span className={styles.price}>{formatPrice(a.total_price_kurus, a.price_is_starting_from)}</span>
      </div>
      <p className={styles.services}>{(a.services ?? []).map((s) => s.name).join(' + ')}</p>
      <AppointmentStatus appointment={a} />
      {upcoming && !confirming && (
        <button type="button" className={styles.cancel} onClick={() => setConfirming(true)}>
          Randevuyu iptal et
        </button>
      )}
      {confirming && (
        <div className={styles.confirmBox}>
          <p>
            {late
              ? 'Randevunuza salonun iptal süresinden az kaldı. Bu iptal “geç iptal” olarak kaydedilir.'
              : 'Randevuyu iptal etmek istediğinize emin misiniz?'}
          </p>
          <div className={styles.confirmActions}>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className={`btn ${styles.danger}`} onClick={cancel} disabled={busy}>
              Evet, iptal et
            </button>
          </div>
        </div>
      )}
      {error && <p className="alert alert-danger">{error}</p>}
    </article>
  );
}
