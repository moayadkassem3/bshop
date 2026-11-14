import type { Deps } from '../deps.js';
import type { Queryable } from '../db.js';
import type { User } from './auth.js';

/**
 * The phones that get this person's push notifications (native app, phase 3).
 * A token belongs to one phone: signing in there with another account moves it.
 */
export async function registerPushDevice(deps: Deps, user: User, input: { token: string; platform: 'android' | 'ios' }) {
  const now = deps.clock.now();
  await deps.db.query(
    `INSERT INTO push_devices (token, user_id, platform, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = EXCLUDED.updated_at`,
    [input.token, user.id, input.platform, now],
  );
}

/** Signing out on a phone: it stops receiving this person's notifications. */
export async function removePushDevice(deps: Deps, user: User, token: string) {
  await deps.db.query('DELETE FROM push_devices WHERE token = $1 AND user_id = $2', [token, user.id]);
}

export async function pushTokensFor(q: Queryable, userId: string) {
  const { rows } = await q.query<{ token: string }>('SELECT token FROM push_devices WHERE user_id = $1', [userId]);
  return rows.map((r) => r.token);
}

/** Firebase said the app is no longer on that phone (uninstalled, or its data cleared). */
export async function forgetPushToken(q: Queryable, token: string) {
  await q.query('DELETE FROM push_devices WHERE token = $1', [token]);
}

/** Shown by "Bildirimleri test et" when the server's Firebase key cannot be used (fcm.ts FcmKeyProblem). */
const KEY_PROBLEMS: Record<string, string> = {
  missing: 'Sunucuda FCM_SERVICE_ACCOUNT_JSON yok. Render’da bu adla, salon-randevu-test servisine eklenmiş olmalı.',
  not_json: 'FCM_SERVICE_ACCOUNT_JSON okunamadı: değer, Firebase’den indirilen JSON dosyasının tamamı olmalı ({ ile başlayıp } ile biter).',
  google_services_file:
    'FCM_SERVICE_ACCOUNT_JSON’a google-services.json yapıştırılmış. Firebase → Proje ayarları → Hizmet hesapları → “Yeni özel anahtar oluştur” ile inen dosya gerekiyor.',
  missing_fields: 'FCM_SERVICE_ACCOUNT_JSON eksik: project_id, client_email veya private_key yok. Hizmet hesabı dosyasının tamamını yapıştırın.',
  bad_private_key: 'FCM_SERVICE_ACCOUNT_JSON’daki private_key bozulmuş. Dosyanın içeriğini değiştirmeden yeniden yapıştırın.',
};

/**
 * "Bildirimleri test et" (Profil): an alarm sent straight to the person's own
 * phones, with what went wrong if it could not be sent, so a phone that does not
 * ring can be diagnosed without the server logs.
 */
export async function sendTestPush(deps: Deps, user: User) {
  const phones = (await pushTokensFor(deps.db, user.id)).length;
  if (deps.push.name === 'console') {
    const problem = deps.push.problem ?? 'missing';
    return { sent: false, reason: 'NOT_CONFIGURED' as const, problem, message: KEY_PROBLEMS[problem] ?? KEY_PROBLEMS.not_json, phones };
  }
  if (!phones) return { sent: false, reason: 'NO_PHONE' as const, phones };
  try {
    await deps.push.send(user.id, {
      title: 'Test alarmı',
      body: 'Bildirimler bu telefonda çalışıyor. Yeni randevular böyle çalar.',
      data: { kind: 'confirmed', template: 'test' },
    });
    return { sent: true, phones: (await pushTokensFor(deps.db, user.id)).length };
  } catch (err) {
    return { sent: false, reason: 'SEND_FAILED' as const, phones, error: String(err).slice(0, 500) };
  }
}
