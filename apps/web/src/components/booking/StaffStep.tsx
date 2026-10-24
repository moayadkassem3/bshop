'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { relativeDayTime } from '@/lib/format';
import type { Slot, StaffMember } from '@/lib/types';
import styles from './booking.module.css';

type FirstAvailable = { result: { date: string; slot: Slot } | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr'))
    .join('');
}

export function StaffStep(props: {
  slug: string;
  staff: StaffMember[];
  serviceIds: string[];
  value: string | null;
  onChange: (staffId: string | null) => void;
}) {
  const [nextFree, setNextFree] = useState<Record<string, string | null>>({});
  const key = props.serviceIds.join(',');

  // The next free time decides more than anything else, so each card shows it.
  useEffect(() => {
    let cancelled = false;
    for (const member of [{ id: 'any' }, ...props.staff]) {
      const staffParam = member.id === 'any' ? '' : `&staffId=${member.id}`;
      api<FirstAvailable>(`/public/shops/${props.slug}/first-available?serviceIds=${key}${staffParam}`)
        .then((r) => !cancelled && setNextFree((m) => ({ ...m, [member.id]: r.result?.slot.startsAt ?? null })))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.staff, key]);

  const nextLabel = (id: string) =>
    id in nextFree ? (nextFree[id] ? `İlk boş saat: ${relativeDayTime(nextFree[id]!)}` : 'Yakında boş saat yok') : 'Boş saat aranıyor…';

  return (
    <section aria-labelledby="staff-title">
      <h2 id="staff-title" className={styles.stepTitle}>
        Usta seçin
      </h2>
      <ul className={styles.list} role="list">
        <li>
          <label className={`${styles.option} ${props.value === null ? styles.optionSelected : ''}`}>
            <input type="radio" name="staff" className="sr-only" checked={props.value === null} onChange={() => props.onChange(null)} />
            <span className={`${styles.avatar} ${styles.avatarAny}`} aria-hidden>
              ★
            </span>
            <span className={styles.optionBody}>
              <span className={styles.optionName}>Fark etmez (ilk müsait)</span>
              <span className={styles.optionMeta}>{nextLabel('any')}</span>
            </span>
            <span className={styles.check} aria-hidden>
              {props.value === null ? '✓' : ''}
            </span>
          </label>
        </li>
        {props.staff.map((member) => (
          <li key={member.id}>
            <label className={`${styles.option} ${props.value === member.id ? styles.optionSelected : ''}`}>
              <input
                type="radio"
                name="staff"
                className="sr-only"
                checked={props.value === member.id}
                onChange={() => props.onChange(member.id)}
              />
              <span className={styles.avatar} aria-hidden>
                {initials(member.display_name)}
              </span>
              <span className={styles.optionBody}>
                <span className={styles.optionName}>{member.display_name}</span>
                <span className={styles.optionMeta}>{nextLabel(member.id)}</span>
              </span>
              <span className={styles.check} aria-hidden>
                {props.value === member.id ? '✓' : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
