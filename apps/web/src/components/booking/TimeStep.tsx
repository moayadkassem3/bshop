'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatTime, istanbulHour, upcomingDays } from '@/lib/format';
import type { Availability, Slot } from '@/lib/types';
import styles from './booking.module.css';

const DAYS = upcomingDays(21);
const PARTS: { label: string; test: (hour: number) => boolean }[] = [
  { label: 'Sabah', test: (h) => h < 12 },
  { label: 'Öğleden sonra', test: (h) => h >= 12 && h < 17 },
  { label: 'Akşam', test: (h) => h >= 17 },
];

export function TimeStep(props: {
  slug: string;
  serviceIds: string[];
  staffId: string | null;
  date: string;
  onDateChange: (date: string) => void;
  value: Slot | null;
  onChange: (slot: Slot) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const query = `serviceIds=${props.serviceIds.join(',')}${props.staffId ? `&staffId=${props.staffId}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setError(null);
    api<Availability>(`/public/shops/${props.slug}/availability?date=${props.date}&${query}`)
      .then((r) => !cancelled && setSlots(r.slots))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.date, query]);

  async function firstAvailable() {
    setFinding(true);
    try {
      const r = await api<{ result: { date: string; slot: Slot } | null }>(`/public/shops/${props.slug}/first-available?${query}`);
      if (r.result) {
        props.onDateChange(r.result.date);
        props.onChange(r.result.slot);
      } else setError('Önümüzdeki günlerde boş saat bulunamadı.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFinding(false);
    }
  }

  return (
    <section aria-labelledby="time-title">
      <h2 id="time-title" className={styles.stepTitle}>
        Saat seçin
      </h2>
      <button type="button" className={`btn btn-block ${styles.firstFree}`} onClick={firstAvailable} disabled={finding}>
        ⚡ İlk uygun saati bul
      </button>

      <div className={styles.days} role="listbox" aria-label="Gün">
        {DAYS.map((d) => (
          <button
            key={d.date}
            type="button"
            role="option"
            aria-selected={d.date === props.date}
            className={`${styles.day} ${d.date === props.date ? styles.daySelected : ''}`}
            onClick={() => props.onDateChange(d.date)}
          >
            <span className={styles.dayName}>{d.isToday ? 'Bugün' : d.weekday}</span>
            <span className={styles.dayNumber}>{d.day}</span>
            <span className={styles.dayMonth}>{d.month}</span>
          </button>
        ))}
      </div>

      {error && <p className="alert alert-danger">{error}</p>}
      {!slots && !error && <div className={styles.skeleton} aria-label="Saatler yükleniyor" />}
      {slots && slots.length === 0 && (
        <div className={styles.empty}>
          <p>Bu gün için boş saat kalmadı.</p>
          <button type="button" className="btn" onClick={firstAvailable} disabled={finding}>
            Sonraki boş saati göster
          </button>
        </div>
      )}
      {slots &&
        PARTS.map((part) => {
          const inPart = slots.filter((s) => part.test(istanbulHour(s.startsAt)));
          if (!inPart.length) return null;
          return (
            <div key={part.label} className={styles.slotGroup}>
              <h3 className={styles.slotGroupTitle}>{part.label}</h3>
              <div className={styles.slots}>
                {inPart.map((s) => {
                  const selected = props.value?.startsAt === s.startsAt;
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      className={`${styles.slot} ${selected ? styles.slotSelected : ''}`}
                      aria-pressed={selected}
                      onClick={() => props.onChange(s)}
                    >
                      <span className={styles.slotTime}>{formatTime(s.startsAt)}</span>
                      {s.instantConfirmation && <span className={styles.slotInstant}>Anında onay</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </section>
  );
}
