import { PermissionsAndroid, Platform } from 'react-native';
import { SalonPush } from '../../modules/salon-push';
import { api, ApiError, errorMessage } from './api';

/** What the server puts in each push message (apps/api notifications.ts). */
export type PushData = {
  kind?: string;
  title?: string;
  body?: string;
  shopId?: string;
  appointmentId?: string;
  template?: string;
  /** '1' outside the salon's working hours: an ordinary notification, never an alarm. */
  quiet?: string;
};

/** New appointments and unanswered requests ring as an alarm (modules/salon-push Alerts.kt). */
export const ALARM_KINDS = new Set(['request', 'confirmed', 'reminder']);
/** A request can be answered from the alarm: Onayla / Reddet. */
export const ANSWERABLE_KINDS = new Set(['request', 'reminder']);

/**
 * This phone receives the signed-in person's notifications (phase 3): asks for
 * permission once (Android 13+), then gives the server the phone's Firebase
 * token. Called after every sign-in and app start; quiet when offline. Returns
 * what went wrong, for "Bildirimleri test et".
 */
export async function registerPush(): Promise<string | null> {
  if (!SalonPush) return 'Bu sürümde bildirim desteği yok.';
  try {
    SalonPush.ensureChannels();
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
  } catch {
    // The permission question failing is not a reason to skip the token.
  }
  let token: string;
  try {
    token = await SalonPush.getToken();
  } catch (err) {
    return `Firebase bu telefonda başlatılamadı: ${err instanceof Error ? err.message : String(err)}`;
  }
  try {
    await api('/me/push-device', { method: 'POST', body: { token, platform: 'android' } });
    return null;
  } catch (err) {
    return `Telefon sunucuya kaydedilemedi: ${errorMessage(err)}`;
  }
}

type TestResult = { sent: boolean; phones: number; reason?: 'NOT_CONFIGURED' | 'NO_PHONE' | 'SEND_FAILED'; error?: string; message?: string };

/** "Bildirimleri test et": registers this phone again, then asks the server for a test alarm. */
export async function testPush(): Promise<{ ok: boolean; message: string }> {
  const problem = await registerPush();
  if (problem) return { ok: false, message: problem };
  let result: TestResult;
  try {
    result = await api<TestResult>('/me/push-test', { method: 'POST', body: {} });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { ok: false, message: 'Sunucu henüz bildirim desteği olan sürüme güncellenmemiş.' };
    return { ok: false, message: `Sunucuya ulaşılamadı: ${errorMessage(err)}` };
  }
  if (result.sent) return { ok: true, message: 'Test alarmı gönderildi; birkaç saniye içinde bu telefon çalmalı. Çalmazsa telefonun bildirim ve pil ayarlarına bakın.' };
  if (result.reason === 'NOT_CONFIGURED') return { ok: false, message: `Sunucu bildirim gönderemiyor. ${result.message ?? 'Firebase anahtarı (FCM_SERVICE_ACCOUNT_JSON) okunamadı.'}` };
  if (result.reason === 'NO_PHONE') return { ok: false, message: 'Bu telefon sunucuda kayıtlı görünmüyor.' };
  return { ok: false, message: `Firebase gönderemedi: ${result.error ?? 'bilinmeyen hata'}` };
}

/** Signing out: this phone stops receiving the account's notifications. */
export async function unregisterPush(): Promise<void> {
  if (!SalonPush) return;
  try {
    const token = await SalonPush.getToken();
    await api('/me/push-device', { method: 'DELETE', body: { token } });
  } catch {
    // The server also forgets phones whose app is uninstalled.
  }
}

export function parsePushData(payload: string): PushData {
  try {
    return JSON.parse(payload) as PushData;
  } catch {
    return {};
  }
}

/** Screens that show appointments refresh when a push arrives while the app is open. */
const listeners = new Set<(data: PushData) => void>();
export function onPushReceived(listener: (data: PushData) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function emitPush(data: PushData) {
  for (const l of listeners) l(data);
}
