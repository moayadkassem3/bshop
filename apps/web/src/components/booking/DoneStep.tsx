'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppointmentStatus } from '@/components/AppointmentStatus';
import { FavoriteButton } from '@/components/FavoriteButton';
import { api } from '@/lib/api';
import { formatLongDate, formatTime } from '@/lib/format';
import type { CustomerAppointment } from '@/lib/types';
import type { BookingResult } from './ConfirmStep';
import styles from './booking.module.css';
import { TAB } from '@/lib/motion';

/** After booking: shows pending or confirmed, and refreshes until the shop answers. */
export function DoneStep({ result, slug }: { result: BookingResult; slug: string }) {
  const [appointments, setAppointments] = useState<CustomerAppointment[] | null>(null);
  const ids = result.appointments.map((a) => a.id);
  const key = ids.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      try {
        const all = await api<CustomerAppointment[]>('/me/appointments');
        if (cancelled) return;
        const mine = all.filter((a) => key.split(',').includes(a.id));
        setAppointments(mine);
        if (mine.some((a) => a.status === 'pending')) timer = setTimeout(load, 10_000);
      } catch {
        if (!cancelled) timer = setTimeout(load, 15_000);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const allConfirmed = appointments?.every((a) => a.status === 'confirmed');

  return (
    <section className={styles.done} aria-live="polite">
      <div className={styles.doneIcon} aria-hidden>
        {allConfirmed ? (
          // The one celebratory moment (v1.7): the tick draws itself in.
          <svg viewBox="0 0 24 24" width="34" height="34">
            <path className={styles.doneCheck} d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          // Sent, waiting for the salon: a clock drawing itself, not a tick.
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle className={styles.doneCheck} cx="12" cy="12" r="8.5" pathLength={1} />
            <path className={styles.doneCheck} d="M12 7.5V12l3 2" pathLength={1} />
          </svg>
        )}
      </div>
      <h2 className={styles.doneTitle}>{allConfirmed ? 'Randevunuz onaylandı' : 'Talebiniz salona iletildi'}</h2>
      {(appointments ?? []).map((a) => (
        <div key={a.id} className={`card ${styles.doneCard}`}>
          <p className={styles.doneWhen}>
            {formatLongDate(a.starts_at)} · {formatTime(a.starts_at)}
          </p>
          <p className="muted">
            {a.shop_name} · {a.staff_name}
            {a.guest_name ? ` · ${a.guest_name} için` : ''}
          </p>
          <AppointmentStatus appointment={a} />
        </div>
      ))}
      <div className={styles.doneFavorite}>
        <p className="muted">Bir dahaki sefere hızlıca bulmak için:</p>
        <FavoriteButton slug={slug} label />
      </div>
      <div className={styles.doneActions}>
        <Link transitionTypes={TAB} href="/randevularim" className="btn btn-primary">
          Randevularım
        </Link>
        <Link transitionTypes={TAB} href="/" className="btn">
          Ana sayfa
        </Link>
      </div>
    </section>
  );
}
