'use client';

import { useEffect, useState } from 'react';
import { PhoneSignIn, useLegalVersions } from '@/components/PhoneSignIn';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDuration, formatLongDate, formatPrice, formatTime } from '@/lib/format';
import { getToken, setToken } from '@/lib/session';
import type { Me, Service, ShopProfile, Slot } from '@/lib/types';
import styles from './booking.module.css';

export type BookingResult = {
  groupId: string;
  appointments: { id: string; status: 'pending' | 'confirmed'; staffId: string; startsAt: string; deadlineAt: string | null }[];
};

export function cancellationRule(minutes: number): string {
  if (minutes <= 0) return 'Randevu saatine kadar ücretsiz iptal edebilirsiniz.';
  const amount = minutes % 60 === 0 ? `${minutes / 60} saat` : `${minutes} dakika`;
  return `Randevudan ${amount} öncesine kadar iptal edebilirsiniz. Daha geç iptaller “geç iptal” olarak kaydedilir.`;
}

export function ConfirmStep(props: {
  profile: ShopProfile;
  services: Service[];
  staffId: string | null;
  staffName: string | null;
  slot: Slot;
  durationMinutes: number;
  totalKurus: number;
  startingFrom: boolean;
  onBooked: (result: BookingResult) => void;
  onSlotTaken: () => void;
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [forWhom, setForWhom] = useState<'self' | 'other'>('self');
  const [guestName, setGuestName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTerms, setNeedsTerms] = useState(false);
  const [termsTicked, setTermsTicked] = useState(false);
  const versions = useLegalVersions();

  useEffect(() => {
    if (!getToken()) {
      setMe(null);
      return;
    }
    api<Me>('/me')
      .then(setMe)
      .catch(() => {
        setToken(null);
        setMe(null);
      });
  }, []);

  const needsNames = Boolean(me && (!me.first_name || !me.last_name));
  const ready =
    Boolean(me) &&
    (!needsNames || (firstName.trim() && lastName.trim())) &&
    (forWhom === 'self' || guestName.trim().length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (needsTerms) {
        await api('/me/consents', {
          method: 'POST',
          body: [{ key: 'kullanici-sozlesmesi', version: versions['kullanici-sozlesmesi'] }],
        });
        setNeedsTerms(false);
      }
      const result = await api<BookingResult>(`/shops/${props.profile.slug}/bookings`, {
        method: 'POST',
        body: {
          ...(needsNames ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
          items: [
            {
              serviceIds: props.services.map((s) => s.id),
              staffId: props.staffId,
              startsAt: props.slot.startsAt,
              guestName: forWhom === 'other' ? guestName.trim() : null,
            },
          ],
        },
      });
      props.onBooked(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') return props.onSlotTaken();
      if (err instanceof ApiError && err.code === 'TERMS_REQUIRED') {
        setNeedsTerms(true);
        return;
      }
      if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
        setToken(null);
        setMe(null);
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="confirm-title" className={styles.confirm}>
      <h2 id="confirm-title" className={styles.stepTitle}>
        Son bir kontrol
      </h2>

      <div className={`card ${styles.summaryCard}`}>
        <div className={styles.summaryWhen}>
          <span className={styles.summaryDate}>{formatLongDate(props.slot.startsAt)}</span>
          <span className={styles.summaryTime}>{formatTime(props.slot.startsAt)}</span>
        </div>
        <dl className={styles.summaryList}>
          <div>
            <dt>Salon</dt>
            <dd>{props.profile.name}</dd>
          </div>
          <div>
            <dt>Personel</dt>
            <dd>{props.staffName ?? 'İlk müsait personel (randevu oluşunca belli olur)'}</dd>
          </div>
          <div>
            <dt>Hizmetler</dt>
            <dd>
              {props.services.map((s) => (
                <span key={s.id} className={styles.summaryService}>
                  <span>{s.name}</span>
                  <span>{formatPrice(s.price_kurus, s.price_is_starting_from)}</span>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Süre</dt>
            <dd>{formatDuration(props.durationMinutes)}</dd>
          </div>
          <div className={styles.summaryTotal}>
            <dt>Toplam</dt>
            <dd>{formatPrice(props.totalKurus, props.startingFrom)}</dd>
          </div>
        </dl>
        <ul className={styles.rules}>
          <li>
            {props.slot.instantConfirmation
              ? 'Bu saat anında onaylanır.'
              : 'Salon en geç 15 dakika içinde onaylar. Yanıt gelmezse randevunuz otomatik onaylanır; sonuç SMS ile gelir.'}
          </li>
          <li>{cancellationRule(props.profile.cancellationCutoffMinutes)}</li>
          <li>Ödeme salonda yapılır.</li>
          {props.profile.address && <li>Adres: {props.profile.address}</li>}
        </ul>
      </div>

      <fieldset className={styles.forWhom}>
        <legend>Randevu kimin için?</legend>
        <div className={styles.segmented}>
          <label className={forWhom === 'self' ? styles.segmentOn : undefined}>
            <input type="radio" className="sr-only" checked={forWhom === 'self'} onChange={() => setForWhom('self')} />
            Kendim
          </label>
          <label className={forWhom === 'other' ? styles.segmentOn : undefined}>
            <input type="radio" className="sr-only" checked={forWhom === 'other'} onChange={() => setForWhom('other')} />
            Başka biri (ör. çocuğum)
          </label>
        </div>
        {forWhom === 'other' && (
          <div className="field">
            <label htmlFor="guest-name">Randevu alacak kişinin adı</label>
            <input id="guest-name" className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            <span className="muted" style={{ fontSize: 13 }}>
              Bilgilendirme SMS’leri sizin telefonunuza gelir.
            </span>
          </div>
        )}
      </fieldset>

      {me === null && (
        <div className={`card ${styles.signIn}`}>
          <h3>Telefonunuzu doğrulayın</h3>
          <p className="muted">Randevu sonucunu bu numaraya SMS ile göndereceğiz.</p>
          <PhoneSignIn askNames onSignedIn={setMe} />
        </div>
      )}

      {me && (
        <div className={`card ${styles.signedIn}`}>
          {needsNames ? (
            <div className={styles.nameRow}>
              <div className="field">
                <label htmlFor="c-first">Ad</label>
                <input id="c-first" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="c-last">Soyad</label>
                <input id="c-last" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
          ) : (
            <p>
              <strong>
                {me.first_name} {me.last_name}
              </strong>{' '}
              <span className="muted">· {me.phone}</span>
            </p>
          )}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setToken(null);
              setMe(null);
            }}
          >
            Başka numara kullan
          </button>
        </div>
      )}

      {needsTerms && (
        <label className={`card ${styles.terms}`}>
          <input type="checkbox" checked={termsTicked} onChange={(e) => setTermsTicked(e.target.checked)} />
          <span>
            Randevu almak için{' '}
            <a href="/sozlesmeler/kullanici-sozlesmesi" target="_blank" rel="noreferrer">
              Kullanıcı Sözleşmesi
            </a>
            ’ni okudum ve kabul ediyorum.
          </span>
        </label>
      )}

      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!ready || busy || (needsTerms && !termsTicked)}
        onClick={submit}
      >
        {busy ? 'Oluşturuluyor…' : 'Randevuyu oluştur'}
      </button>
    </section>
  );
}
