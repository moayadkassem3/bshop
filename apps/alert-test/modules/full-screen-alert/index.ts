import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type LaunchAlert = { payload: string; action: string | null; notificationId: number };

type NativeModule = {
  canUseFullScreenIntent(): boolean;
  openFullScreenSettings(): void;
  schedule(delaySeconds: number, channelId: string, title: string, body: string, payload: string, insistent: boolean): number;
  dismiss(notificationId: number): void;
  takeLaunchAlert(): LaunchAlert | null;
  addListener(event: 'onAlert', listener: (alert: LaunchAlert) => void): { remove(): void };
};

/** Android-only native module (modules/full-screen-alert); null on other platforms. */
export const FullScreenAlert: NativeModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('FullScreenAlert') : null;
