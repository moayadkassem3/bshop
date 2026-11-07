'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppointmentStatus } from '@/components/AppointmentStatus';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatLongDate, formatPrice, formatTime } from '@/lib/format';
import { getToken, setToken } from '@/lib/session';
import { appointmentUpdates, markUpdatesSeen, updatesSeenAt } from '@/lib/updates';
import type { CustomerAppointment } from '@/lib/types';
import styles from './appointments.module.css';
import { FORWARD, TAB } from '@/lib/motion';
import { SkeletonList } from '@/components/Skeleton';
import { StarRow } from '@/components/Stars';
import { StarInput } from '@/components/StarInput';

export function MyAppointments() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<CustomerAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the salon changed since Randevular was last opened: marked "Yeni" for this visit (v1.7).
  const [fresh, setFresh] = useState<Set<string>>(new Set());

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
    if (!has) return;
    load();
    appointmentUpdates(updatesSeenAt())
      .then((ids) => {
        setFresh(new Set(ids));
        markUpdatesSeen();
      })
      .catch(() => undefined);
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
          {/* Signing in happens in Profil; this is a shortcut there and back (v1.7). */}
          <div className={`card ${styles.empty}`}>
            <span className={styles.emptyIcon} aria-hidden>
              <CalendarIcon />
            </span>
            <h2>Randevularını görmek için giriş yap</h2>
            <p>Telefon numaranla giriş yaptıktan sonra randevuların ve taleplerin burada görünür.</p>
            <Link transitionTypes={TAB} href="/profil?devam=/randevularim" className="btn btn-primary">
              Giriş yap
            </Link>
          </div>
        </div>
      </>
    );
  }

  return <List items={items} fresh={fresh} error={error} onChanged={load} />;
}

type When = 'upcoming' | 'past';

// As in the app (founder, 8 November 2026): one list. Yaklaşan holds everything still ahead,
// requests waiting for an answer included (each card says where it stands); Geçmiş the rest.
const isUpcoming = (a: CustomerAppointment, now: number) =>
  ['pending', 'offered', 'confirmed'].includes(a.status) && new Date(a.ends_at).getTime() > now;

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={`page-header ${styles.header}`}>
      <div className="container narrow">
        <h1>Randevularım</h1>
        {children}
      </div>
    </header>
  );
}

function List(props: { items: CustomerAppointment[] | null; fresh: Set<string>; error: string | null; onChanged: () => void }) {
  const now = Date.now();
  const all = props.items ?? [];
  const isFresh = (a: CustomerAppointment) => props.fresh.has(a.id);
  // A change from the salon opens where it is: Yaklaşan or Geçmiş.
  const firstFresh = all.find(isFresh);
  const [chosenWhen, setWhen] = useState<When | null>(null);
  const when: When = chosenWhen ?? (firstFresh && !isUpcoming(firstFresh, now) ? 'past' : 'upcoming');
  const freshIn = (w: When) => all.some((a) => isFresh(a) && (w === 'upcoming') === isUpcoming(a, now));
  const shown = all
    .filter((a) => (when === 'upcoming') === isUpcoming(a, now))
    // Soonest first in Yaklaşan; what the salon just changed comes first either way.
    .sort((a, b) => (when === 'upcoming' ? a.starts_at.localeCompare(b.starts_at) : 0))
    .sort((a, b) => Number(isFresh(b)) - Number(isFresh(a)));

  return (
    <>
      <Header />
      <div className={`container narrow ${styles.body}`}>
        <div className={styles.chips} role="radiogroup" aria-label="Zaman">
          {(['upcoming', 'past'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={when === w} className={`${styles.chip} ${when === w ? styles.chipOn : ''}`} onClick={() => setWhen(w)}>
              {w === 'upcoming' ? 'Yaklaşan' : 'Geçmiş'}
              {freshIn(w) && <span className={styles.newDot} aria-label="yeni" />}
            </button>
          ))}
        </div>
        <div className={styles.wrap}>
          {props.error && <p className="alert alert-danger">{props.error}</p>}
          {!props.items && !props.error && <SkeletonList rows={2} label="Randevular yükleniyor" />}
          {props.items && shown.length === 0 && (
            <div className={`card ${styles.empty}`}>
              <span className={styles.emptyIcon} aria-hidden>
                <CalendarIcon />
              </span>
              <h2>{when === 'upcoming' ? 'Yaklaşan randevunuz yok' : 'Geçmiş randevunuz yok'}</h2>
              {when === 'upcoming' && <p>Keşfet’ten size yakın bir kuaför bulun.</p>}
              {when === 'upcoming' && (
                <Link transitionTypes={TAB} href="/" className="btn btn-primary">
                  <MapIcon /> Kuaför keşfet
                </Link>
              )}
            </div>
          )}
          {shown.map((a) => (
            <AppointmentCard key={a.id} appointment={a} isNew={isFresh(a)} onChanged={props.onChanged} />
          ))}
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

function AppointmentCard({ appointment: a, isNew, onChanged }: { appointment: CustomerAppointment; isNew: boolean; onChanged: () => void }) {
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
    <article className={`card ${styles.card} motion-fade`}>
      <div className={styles.cardTop}>
        <div>
          <p className={styles.when}>
            {formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}
          </p>
          <Link transitionTypes={FORWARD} href={`/${a.shop_slug}`} className={styles.shop}>
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
      <div className={styles.statusRow}>
        {isNew && <span className="badge badge-danger">Yeni</span>}
        <AppointmentStatus appointment={a} />
      </div>
      {a.status === 'offered' && <OfferAnswer appointment={a} onChanged={onChanged} />}
      {a.status === 'completed' && (a.rateable || a.my_rating) && <RateVisit appointment={a} />}
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

/**
 * "Nasıldı?" (v1.7): after a completed visit, one tap on a star rates the salon.
 * It can be changed for 14 days; after that the stars stay as given.
 */
function RateVisit({ appointment: a }: { appointment: CustomerAppointment }) {
  const [stars, setStars] = useState<number | null>(a.my_rating ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(value: number) {
    const before = stars;
    setStars(value);
    setBusy(true);
    setError(null);
    try {
      await api(`/me/appointments/${a.id}/rating`, { method: 'POST', body: { stars: value } });
      setSaved(true);
    } catch (err) {
      setStars(before);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!a.rateable) {
    return (
      <p className={styles.rated}>
        Puanınız <StarRow value={stars ?? 0} size={15} />
      </p>
    );
  }
  return (
    <div className={styles.rate}>
      <p className={styles.rateTitle}>{stars ? (saved ? 'Teşekkürler!' : 'Puanınız') : 'Nasıldı? Salonu puanlayın'}</p>
      <StarInput value={stars} onChange={rate} disabled={busy} />
      {saved && <p className={`${styles.rateNote} motion-fade`}>Puanınız salon sayfasında isminizin baş harfiyle görünür. 14 gün içinde değiştirebilirsiniz.</p>}
      {error && <p className="alert alert-danger">{error}</p>}
    </div>
  );
}

/** "Salon yeni saat önerdi": the customer takes the offered time or turns it down. */
function OfferAnswer({ appointment: a, onChanged }: { appointment: CustomerAppointment; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(action: 'accept-offer' | 'decline-offer') {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/appointments/${a.id}/${action}`, { method: 'POST' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  return (
    <div className={`${styles.offer} motion-reveal`}>
      <p>
        {a.offered_from && (
          <>
            İstediğiniz <strong>{formatLongDate(a.offered_from)} {formatTime(a.offered_from)}</strong> dolu olduğu için salon bu saati önerdi.{' '}
          </>
        )}
        {a.deadline_at && <>Yanıt için son: {formatLongDate(a.deadline_at)} {formatTime(a.deadline_at)}.</>}
      </p>
      <div className={styles.confirmActions}>
        <button type="button" className="btn" disabled={busy} onClick={() => answer('decline-offer')}>
          Reddet
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer('accept-offer')}>
          Kabul et
        </button>
      </div>
      {error && <p className="alert alert-danger">{error}</p>}
    </div>
  );
}
