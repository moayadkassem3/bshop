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

/** Current agreement versions, so acceptance is recorded against the text that was shown. */
export function useLegalVersions(): Record<string, string> {
  const [versions, setVersions] = useState<Record<string, string>>({});
  useEffect(() => {
    api<{ key: string; version: string }[]>('/public/legal')
      .then((docs) => setVersions(Object.fromEntries(docs.map((d) => [d.key, d.version]))))
      .catch(() => undefined);
  }, []);
  return versions;
}

/** Customer sign-in on the website: phone number, then the 6-digit SMS code. */
export function PhoneSignIn({ askNames, as = 'customer', onSignedIn }: Props) {
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const versions = useLegalVersions();
  const customer = as === 'customer';

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // New customers also choose Erkek or Kadın, which sets Keşfet's default salon type (v1.7).
  const namesOk = (!askNames || (firstName.trim() && lastName.trim() && (!customer || gender))) && (!customer || acceptTerms);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ demoCode?: string } | undefined>('/auth/otp/request', { method: 'POST', body: { phone, portal: as } });
      // Test deployments have no SMS provider yet, so the code is shown here instead.
      if (res?.demoCode) {
        setDemoCode(res.demoCode);
        setCode(res.demoCode);
      }
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
          ...(askNames ? { firstName: firstName.trim(), lastName: lastName.trim(), ...(gender ? { gender } : {}) } : {}),
          // Acceptance is recorded with the version shown (v1.6).
          ...(customer
            ? {
                consents: [
                  { key: 'kullanici-sozlesmesi', version: versions['kullanici-sozlesmesi'] },
                  ...(acceptMarketing ? [{ key: 'ticari-ileti-izni', version: versions['ticari-ileti-izni'] }] : []),
                ],
              }
            : {}),
        },
      });
      setToken(res.token, res.user.portal);
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
      {askNames && customer && <GenderChoice value={gender} onChange={setGender} />}
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
      {customer && (
        <div className={styles.consents}>
          <label className={styles.check}>
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              <a href="/sozlesmeler/kullanici-sozlesmesi" target="_blank" rel="noreferrer">
                Kullanıcı Sözleşmesi
              </a>
              ’ni okudum ve kabul ediyorum.
            </span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={acceptMarketing} onChange={(e) => setAcceptMarketing(e.target.checked)} />
            <span>
              Kampanya ve yeniliklerden SMS/e-posta ile haberdar olmak istiyorum (
              <a href="/sozlesmeler/ticari-ileti-izni" target="_blank" rel="noreferrer">
                isteğe bağlı
              </a>
              ).
            </span>
          </label>
          <p className={styles.notice}>
            Kişisel verileriniz{' '}
            <a href="/sozlesmeler/kvkk-aydinlatma" target="_blank" rel="noreferrer">
              KVKK Aydınlatma Metni
            </a>{' '}
            kapsamında işlenir.
          </p>
        </div>
      )}
      {!codeSent ? (
        <button type="button" className="btn btn-primary btn-block" disabled={busy || phone.length < 10 || !namesOk} onClick={sendCode}>
          Doğrulama kodu gönder
        </button>
      ) : (
        <>
          {demoCode && (
            <p className={styles.demo} role="status">
              <strong>Test sürümü:</strong> SMS gönderilmez. Kodunuz <strong>{demoCode}</strong> ve aşağıya yazıldı.
            </p>
          )}
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

/** Erkek / Kadın: Keşfet opens on the matching salon type. */
export function GenderChoice(props: { value: 'male' | 'female' | null; onChange: (value: 'male' | 'female') => void }) {
  return (
    <div className="field">
      <span className={styles.label} id="gender-label">
        Cinsiyet
      </span>
      <div className={styles.gender} role="radiogroup" aria-labelledby="gender-label">
        {(['male', 'female'] as const).map((g) => (
          <button key={g} type="button" role="radio" aria-checked={props.value === g} className={props.value === g ? styles.genderOn : ''} onClick={() => props.onChange(g)}>
            {g === 'male' ? 'Erkek' : 'Kadın'}
          </button>
        ))}
      </div>
    </div>
  );
}
