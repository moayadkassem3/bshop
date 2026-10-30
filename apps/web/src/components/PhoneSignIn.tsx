'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { moveLocalFavoritesToAccount } from '@/lib/favorites';
import { phoneComplete } from '@/lib/phone';
import { lastMode, setToken } from '@/lib/session';
import type { Me } from '@/lib/types';
import { PhoneInput } from './PhoneInput';
import styles from './PhoneSignIn.module.css';

type Props = {
  /** Customer or business sign-in (v1.5); business only accepts phones registered with a shop. */
  as?: 'customer' | 'business';
  /**
   * The one sign-in in Profil (v1.7): people who work at a salon go straight to
   * business mode, or to customer mode if that is what this browser used last.
   * Profil's switch button changes it afterwards.
   */
  chooseMode?: boolean;
  onSignedIn: (me: Me) => void;
};

type VerifyResult = { token: string; user: Me; needsProfile?: boolean; needsTerms?: boolean; hasBusiness?: boolean };

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

/**
 * Sign-in with the phone only: number, then the 6-digit SMS code (v1.7). A new
 * customer then creates their account once (name, gender, user agreement);
 * returning customers go straight in.
 */
export function PhoneSignIn({ as = 'customer', chooseMode = false, onSignedIn }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [account, setAccount] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

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
      // Matches the server's wait between codes (shorter on the test site, which sends no SMS).
      setResendIn(res?.demoCode ? 10 : 30);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_TOO_SOON' && err.retryAfterSeconds) setResendIn(err.retryAfterSeconds);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<VerifyResult>('/auth/otp/verify', { method: 'POST', body: { phone, code, portal: as } });
      // Read before the new session is stored, which records customer mode.
      const toBusiness = chooseMode && res.hasBusiness && lastMode() !== 'customer';
      setToken(res.token, res.user.portal);
      await moveLocalFavoritesToAccount();
      if (toBusiness) {
        const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to: 'business' } });
        setToken(r.token, r.user.portal);
        onSignedIn(r.user);
      } else if (res.needsProfile) setAccount(res);
      else onSignedIn(res.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (account) return <CreateAccount result={account} onDone={onSignedIn} />;
  return (
    <div className={styles.wrap}>
      <div className="field">
        <label htmlFor="phone">Cep telefonu</label>
        <PhoneInput
          id="phone"
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setCodeSent(false);
          }}
        />
      </div>
      {!codeSent ? (
        <>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || !phoneComplete(phone)} onClick={sendCode}>
            Doğrulama kodu gönder
          </button>
          <p className={styles.notice}>
            Hesabınız yoksa kodu girdikten sonra birkaç bilgiyle oluşturulur. Kişisel verileriniz{' '}
            <a href="/sozlesmeler/kvkk-aydinlatma" target="_blank" rel="noreferrer">
              KVKK Aydınlatma Metni
            </a>{' '}
            kapsamında işlenir.
          </p>
        </>
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
          <button type="button" className="btn btn-primary btn-block" disabled={busy || code.length !== 6} onClick={verify}>
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

/** "Hesabını oluştur": shown once, to a new customer (or one with details missing) after the code. */
function CreateAccount({ result, onDone }: { result: VerifyResult; onDone: (me: Me) => void }) {
  const me = result.user;
  const isNew = !me.first_name && !me.last_name;
  const [firstName, setFirstName] = useState(me.first_name ?? '');
  const [lastName, setLastName] = useState(me.last_name ?? '');
  const [gender, setGender] = useState<'male' | 'female' | null>(me.gender ?? null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versions = useLegalVersions();
  const ok = firstName.trim() && lastName.trim() && gender && (!result.needsTerms || acceptTerms) && versions['kullanici-sozlesmesi'];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Me>('/me', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim(), gender } });
      const consents = [
        ...(result.needsTerms ? [{ key: 'kullanici-sozlesmesi', version: versions['kullanici-sozlesmesi'] }] : []),
        ...(acceptMarketing ? [{ key: 'ticari-ileti-izni', version: versions['ticari-ileti-izni'] }] : []),
      ];
      if (consents.length) await api('/me/consents', { method: 'POST', body: consents });
      onDone({ ...me, ...updated });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div>
        <h3 className={styles.title}>{isNew ? 'Hesabını oluştur' : 'Bilgilerini tamamla'}</h3>
        <p className={styles.notice}>{isNew ? 'Bu numarayla ilk kez giriş yapıyorsun. Bir kereye mahsus birkaç bilgi:' : 'Devam etmeden önce eksik bilgilerini tamamla.'}</p>
      </div>
      <div className={styles.row}>
        <div className="field">
          <label htmlFor="first-name">Ad</label>
          <input id="first-name" className="input" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="last-name">Soyad</label>
          <input id="last-name" className="input" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <GenderChoice value={gender} onChange={setGender} />
      <div className={styles.consents}>
        {result.needsTerms && (
          <label className={styles.check}>
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              <a href="/sozlesmeler/kullanici-sozlesmesi" target="_blank" rel="noreferrer">
                Kullanıcı Sözleşmesi
              </a>
              ’ni okudum ve kabul ediyorum.
            </span>
          </label>
        )}
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
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={busy || !ok} onClick={save}>
        {isNew ? 'Hesabı oluştur' : 'Devam'}
      </button>
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
