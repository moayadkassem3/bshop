import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type LaunchAlert = { payload: string; action: string | null; notificationId: number };

export type Diagnostics = {
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdk: number;
  notificationsEnabled: boolean;
  channelImportance: number | null;
  canUseFullScreenIntent: boolean;
  canDrawOverlays: boolean;
  canScheduleExactAlarms: boolean;
};

type NativeModule = {
  diagnostics(channelId: string): Diagnostics;
  openAppPermissions(): void;
  openOverlaySettings(): void;
  takeNativeLog(): string[];
  openFullScreenSettings(): void;
  schedule(delaySeconds: number, channelId: string, title: string, body: string, payload: string, insistent: boolean): number;
  dismiss(notificationId: number): void;
  takeLaunchAlert(): LaunchAlert | null;
  addListener(event: 'onAlert', listener: (alert: LaunchAlert) => void): { remove(): void };
};

/** Android-only native module (modules/full-screen-alert); null on other platforms. */
export const FullScreenAlert: NativeModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('FullScreenAlert') : null;
