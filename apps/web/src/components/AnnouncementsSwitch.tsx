'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import styles from './AppearanceSwitch.module.css';

/**
 * Profil → Bildirimler (founder, 8 November 2026): announcements from our team reach the
 * app; they can be turned off here too. Appointment notifications always come.
 */
export function AnnouncementsSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ on: boolean }>('/me/announcements')
      .then((r) => setOn(r.on))
      .catch(() => setOn(true));
  }, []);
  return (
    <div className={`card ${styles.box}`}>
      <label className={styles.toggle}>
        <span>Duyurular ve hatırlatmalar</span>
        <input
          type="checkbox"
          role="switch"
          checked={on ?? true}
          disabled={on === null}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            api('/me/announcements', { method: 'PUT', body: { on: next } }).catch(() => setOn(!next));
          }}
        />
      </label>
      <p className={styles.hint}>Uygulamada ekibimizden ara sıra gelen haberler. Randevu bildirimleriniz her zaman gelir.</p>
    </div>
  );
}
