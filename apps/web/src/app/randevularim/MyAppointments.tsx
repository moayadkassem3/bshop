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

  if (signedIn === null) return null;
  if (!signedIn) {
    return (
      <div className={`card ${styles.signIn}`}>
        <p className="muted">Randevularınızı görmek için telefon numaranızı doğrulayın.</p>
        <PhoneSignIn
          askNames={false}
          onSignedIn={() => {
            setSignedIn(true);
            load();
          }}
        />
      </div>
    );
  }

  const now = Date.now();
  const upcoming = (items ?? []).filter((a) => ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() > now);
  const past = (items ?? []).filter((a) => !upcoming.includes(a));

  return (
    <div className={styles.wrap}>
      {error && <p className="alert alert-danger">{error}</p>}
      <h2 className={styles.sectionTitle}>Yaklaşan</h2>
      {items && upcoming.length === 0 && (
        <div className={styles.empty}>
          <p className="muted">Yaklaşan randevunuz yok.</p>
          <Link href="/" className="btn btn-primary">
            Randevu al
          </Link>
        </div>
      )}
      {upcoming.map((a) => (
        <AppointmentCard key={a.id} appointment={a} onChanged={load} />
      ))}
      {past.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Geçmiş</h2>
          {past.map((a) => (
            <AppointmentCard key={a.id} appointment={a} onChanged={load} />
          ))}
        </>
      )}
      <button
        type="button"
        className={styles.signOut}
        onClick={() => {
          setToken(null);
          setItems(null);
          setSignedIn(false);
        }}
      >
        Çıkış yap
      </button>
    </div>
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
