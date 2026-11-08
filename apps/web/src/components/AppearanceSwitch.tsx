'use client';

import { useThemePref, type ThemePref } from '@/lib/theme';
import styles from './AppearanceSwitch.module.css';

const OPTIONS: [ThemePref, string][] = [
  ['light', 'Açık'],
  ['dark', 'Koyu'],
  ['system', 'Otomatik'],
];

/** Profil → Görünüm (founder, 8 November 2026): the website starts light; Koyu is the app's navy. */
export function AppearanceSwitch() {
  const [pref, choose] = useThemePref();
  return (
    <div className={`card ${styles.box}`}>
      <div className={styles.segmented} role="radiogroup" aria-label="Görünüm">
        {OPTIONS.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={pref === value} className={pref === value ? styles.on : ''} onClick={() => choose(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        {pref === 'light' ? 'Site açık renkli.' : pref === 'dark' ? 'Site koyu lacivert.' : 'Cihazınızın açık veya koyu ayarına uyar.'}
      </p>
    </div>
  );
}
