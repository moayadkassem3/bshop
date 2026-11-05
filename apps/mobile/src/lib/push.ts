import { PermissionsAndroid, Platform } from 'react-native';
import { SalonPush } from '../../modules/salon-push';
import { api } from './api';

/** What the server puts in each push message (apps/api notifications.ts). */
export type PushData = {
  kind?: string;
  title?: string;
  body?: string;
  shopId?: string;
  appointmentId?: string;
  template?: string;
};

/** New appointments and unanswered requests ring as an alarm (modules/salon-push Alerts.kt). */
export const ALARM_KINDS = new Set(['request', 'confirmed', 'reminder']);
/** A request can be answered from the alarm: Onayla / Reddet. */
export const ANSWERABLE_KINDS = new Set(['request', 'reminder']);

/**
 * This phone receives the signed-in person's notifications (phase 3): asks for
 * permission once (Android 13+), then gives the server the phone's Firebase
 * token. Called after every sign-in and app start; quiet when offline.
 */
export async function registerPush(): Promise<void> {
  if (!SalonPush) return;
  try {
    SalonPush.ensureChannels();
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    const token = await SalonPush.getToken();
    await api('/me/push-device', { method: 'POST', body: { token, platform: 'android' } });
  } catch {
    // Offline, or Firebase unavailable on this phone: the next start tries again.
  }
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
