import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** A notification that opened the app (or one of its Onayla / Reddet buttons). */
export type LaunchAlert = { payload: string; action: 'onayla' | 'reddet' | null; notificationId: number };

export type PushStatus = { notificationsEnabled: boolean; alarmChannelEnabled: boolean; canUseFullScreenIntent: boolean; sdk: number };

type Subscription = { remove(): void };

type NativeModule = {
  ensureChannels(): void;
  getToken(): Promise<string>;
  status(): PushStatus;
  openNotificationSettings(): void;
  openFullScreenSettings(): void;
  dismiss(notificationId: number): void;
  releaseLockScreen(): void;
  takeLaunchAlert(): LaunchAlert | null;
  addListener(event: 'onAlert', listener: (alert: LaunchAlert) => void): Subscription;
  addListener(event: 'onPush', listener: (data: Record<string, string>) => void): Subscription;
  addListener(event: 'onToken', listener: (e: { token: string }) => void): Subscription;
};

/** Android-only native module (modules/salon-push, phase 3); null elsewhere (iOS until its build, the web preview). */
export const SalonPush: NativeModule | null = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('SalonPush') : null;
