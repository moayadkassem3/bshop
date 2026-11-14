'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { uploadImage } from '@/lib/image';
import { getToken } from '@/lib/session';
import { photoUrl } from '@/lib/shop';
import styles from './SalonPhoto.module.css';

/**
 * Salon bilgileri → "Salon fotoğrafı" (founder, 14 November 2026): the salon's profile photo,
 * shown wherever the salon appears small (lists, the map card, Favoriler, search). Until one is
 * set, the first gallery photo stands in, then the initial. Saved straight away.
 */
export function SalonPhoto({ shopId, name }: { shopId: string; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [logoId, setLogoId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ logo_id: string | null }>(`/staff/shops/${shopId}/settings`)
      .then((s) => setLogoId(s.logo_id ?? null))
      .catch(() => setLogoId(null));
  }, [shopId]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(`/api/staff/shops/${shopId}/logo`, file, getToken());
    const body = await res.json().catch(() => ({}));
    if (res.ok) setLogoId(body.logo_id);
    else setError(errorMessage(new ApiError(res.status, body.error ?? 'UNKNOWN')));
    if (input.current) input.current.value = '';
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${shopId}/logo`, { method: 'DELETE' });
      setLogoId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <div className={styles.picker}>
      <span className={styles.preview} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoId ? <img src={photoUrl(logoId)} alt="" /> : (name.trim()[0] ?? '').toLocaleUpperCase('tr')}
      </span>
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={busy || logoId === undefined} onClick={() => input.current?.click()}>
          {busy ? 'Yükleniyor…' : logoId ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
        </button>
        {logoId && (
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
