'use client';

import { useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { getToken } from '@/lib/session';
import { uploadImage } from '@/lib/image';
import { staffPhotoUrl } from '@/lib/shop';
import styles from './StaffAvatar.module.css';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toLocaleUpperCase('tr');
}

/**
 * A staff member's photo, or their initials until they have one (founder, 8 November 2026).
 * `className` gives the circle its size and colours; the photo fills it.
 */
export function StaffAvatar({ name, photoId, className }: { name: string; photoId?: string | null; className?: string }) {
  return (
    <span className={`${styles.avatar} ${className ?? ''}`} aria-hidden>
      {photoId ? <img src={staffPhotoUrl(photoId)} alt="" className={styles.img} loading="lazy" decoding="async" /> : initials(name)}
    </span>
  );
}

/**
 * Sets or removes a staff photo: the staff member's own (Profil, every salon they work at)
 * or, for owners, anyone's (Personel). Saved straight away.
 */
export function StaffPhotoPicker(props: { name: string; photoId: string | null; targets: { shopId: string; memberId: string }[]; onChange: (photoId: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    let last: string | null = null;
    for (const t of props.targets) {
      const res = await uploadImage(`/api/staff/shops/${t.shopId}/members/${t.memberId}/photo`, file, getToken());
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(new ApiError(res.status, body.error ?? 'UNKNOWN')));
        break;
      }
      last = body.photo_id;
    }
    if (last) props.onChange(last);
    if (input.current) input.current.value = '';
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      for (const t of props.targets) await api(`/staff/shops/${t.shopId}/members/${t.memberId}/photo`, { method: 'DELETE' });
      props.onChange(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <div className={styles.picker}>
      <StaffAvatar name={props.name} photoId={props.photoId} className={styles.large} />
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Yükleniyor…' : props.photoId ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
        </button>
        {props.photoId && (
          <button type="button" className={styles.remove} disabled={busy} onClick={remove}>
            Kaldır
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}
