'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { getToken, setToken } from '@/lib/session';
import { BackArrow } from '@/components/BackArrow';
import { SkeletonList } from '@/components/Skeleton';
import { BACK, TAB } from '@/lib/motion';
import styles from './delete.module.css';

type Plan = {
  cancels: number;
  leaves: { shopId: string; name: string }[];
  handsOver: { shopId: string; name: string; to: string }[];
  closes: { shopId: string; name: string }[];
  blockers: { code: 'HAS_UPCOMING_WORK' | 'SHOP_HAS_APPOINTMENTS'; shopId: string; name: string; count: number }[];
};

/**
 * Hesabı sil (v1.7): reached from a small link at the bottom of Profil. It shows
 * exactly what deleting will do before anything happens. Signed out, it explains
 * how to delete an account (the app stores ask for such a page).
 */
export function DeleteAccount() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const has = Boolean(getToken());
    setSignedIn(has);
    if (!has) return;
    api<Plan>('/me/deletion')
      .then(setPlan)
      .catch((err) => {
        // An expired sign-in: show how to delete instead of an error.
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setSignedIn(false);
        } else setError(errorMessage(err));
      });
  }, []);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('/me', { method: 'DELETE' });
      // Nothing of the account stays on this phone either.
      try {
        for (const key of Object.keys(window.localStorage)) if (key.startsWith('salon-randevu')) window.localStorage.removeItem(key);
        window.sessionStorage.clear();
      } catch {
        // Storage may be unavailable; the session is gone on the server anyway.
      }
      setToken(null);
      setDeleted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <div className={`container narrow ${styles.page}`}>
        <div className={`card ${styles.done} motion-reveal`} role="status">
          <h1>Hesabınız silindi</h1>
          <p>Kişisel bilgileriniz silindi ve bu cihazdaki oturumunuz kapatıldı. Dilerseniz aynı numarayla yeniden hesap açabilirsiniz.</p>
          <Link transitionTypes={TAB} href="/" className="btn btn-primary">
            Keşfet’e dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`container narrow ${styles.page}`}>
      <Link transitionTypes={BACK} href="/profil" className={styles.back}>
        <BackArrow />
        Profil
      </Link>
      <h1 className={styles.title}>Hesabı sil</h1>

      {signedIn === false && (
        <div className={styles.text}>
          <p>
            Hesabınızı silmek için telefon numaranızla giriş yapın, sonra <strong>Profil → Hesabı sil</strong>’e dokunun. Silme işlemi hemen gerçekleşir.
          </p>
          <What />
          <Link href="/profil?devam=/hesabi-sil" className="btn btn-primary">
            Giriş yap
          </Link>
        </div>
      )}

      {signedIn && !plan && !error && <SkeletonList rows={1} />}
      {error && <p className="alert alert-danger">{error}</p>}

      {plan && (
        <div className={`${styles.text} motion-fade`}>
          <p>Hesabınızı silerseniz:</p>
          <ul className={styles.effects}>
            {plan.cancels > 0 && (
              <li>
                <strong>{plan.cancels} yaklaşan randevunuz iptal edilir</strong>; salona bildirilir.
              </li>
            )}
            {plan.leaves.map((s) => (
              <li key={s.shopId}>{s.name} ekibinden çıkarsınız.</li>
            ))}
            {plan.handsOver.map((s) => (
              <li key={s.shopId}>
                {s.name} salonunun sahipliği <strong>{s.to}</strong> kişisine geçer; salon açık kalır.
              </li>
            ))}
            {plan.closes.map((s) => (
              <li key={s.shopId} className={styles.danger}>
                <strong>{s.name} kapanır:</strong> müşterilere görünmez ve ekibiniz de giremez.
              </li>
            ))}
            <li>Adınız, telefon numaranız, favorileriniz, beğenileriniz ve bildirimleriniz silinir.</li>
            <li>Geçmiş randevularınız salonların kayıtlarında isimsiz kalır.</li>
          </ul>

          {plan.blockers.length > 0 ? (
            <div className="alert alert-danger">
              <p className={styles.blockTitle}>Önce şunların çözülmesi gerekiyor:</p>
              <ul>
                {plan.blockers.map((b) => (
                  <li key={b.shopId + b.code}>
                    {b.code === 'SHOP_HAS_APPOINTMENTS'
                      ? `${b.name} kapanacağı için ${b.count} yaklaşan randevu iptal edilmeli (Randevular → Takvim).`
                      : `${b.name}: size atanmış ${b.count} yaklaşan randevu var. Bunları iptal edin veya başka personele aktarın.`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className={styles.note}>Bu işlem geri alınamaz. Aynı numarayla daha sonra yeni bir hesap açabilirsiniz.</p>
              <label className={styles.check}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                Anladım, hesabım kalıcı olarak silinsin.
              </label>
              <button type="button" className={`btn btn-block ${styles.deleteBtn}`} disabled={!agreed || busy} onClick={remove}>
                {busy ? 'Siliniyor…' : 'Hesabımı sil'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What deletion removes, for people reading the page signed out. */
function What() {
  return (
    <ul className={styles.effects}>
      <li>Adınız, telefon numaranız, favorileriniz, beğenileriniz ve bildirimleriniz silinir.</li>
      <li>Yaklaşan randevularınız iptal edilir ve salona bildirilir.</li>
      <li>Geçmiş randevularınız salonların kayıtlarında isimsiz kalır.</li>
      <li>Sözleşme onay kayıtları, yasal yükümlülükler nedeniyle saklanır.</li>
    </ul>
  );
}
