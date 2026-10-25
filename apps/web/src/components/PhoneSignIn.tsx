'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { moveLocalFavoritesToAccount } from '@/lib/favorites';
import { setToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import styles from './PhoneSignIn.module.css';

type Props = {
  /** Ask for first name and surname too (new customers booking for the first time). */
  askNames: boolean;
  /** Customer or business sign-in (v1.5); business only accepts phones registered with a shop. */
  as?: 'customer' | 'business';
  onSignedIn: (me: Me) => void;
};

/** Customer sign-in on the website: phone number, then the 6-digit SMS code. */
export function PhoneSignIn({ askNames, as = 'customer', onSignedIn }: Props) {
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const namesOk = !askNames || (firstName.trim() && lastName.trim());

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone, portal: as } });
      setCodeSent(true);
      setResendIn(60);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: Me }>('/auth/otp/verify', {
        method: 'POST',
        body: {
          phone,
          code,
          portal: as,
          ...(askNames ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}),
        },
      });
      setToken(res.token);
      await moveLocalFavoritesToAccount();
      onSignedIn(res.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {askNames && (
        <div className={styles.row}>
          <div className="field">
            <label htmlFor="first-name">Ad</label>
            <input
              id="first-name"
              className="input"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="last-name">Soyad</label>
            <input
              id="last-name"
              className="input"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="phone">Cep telefonu</label>
        <input
          id="phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="05xx xxx xx xx"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setCodeSent(false);
          }}
        />
      </div>
      {!codeSent ? (
        <button type="button" className="btn btn-primary btn-block" disabled={busy || phone.length < 10 || !namesOk} onClick={sendCode}>
          Doğrulama kodu gönder
        </button>
      ) : (
        <>
          <div className="field">
            <label htmlFor="otp">SMS ile gelen 6 haneli kod</label>
            <input
              id="otp"
              className={`input ${styles.code}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || code.length !== 6 || !namesOk} onClick={verify}>
            Doğrula
          </button>
          <button type="button" className={styles.resend} disabled={busy || resendIn > 0} onClick={sendCode}>
            {resendIn > 0 ? `Yeni kod: ${resendIn} sn` : 'Kodu tekrar gönder'}
          </button>
        </>
      )}
      {error && (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
