import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { SalonPush, type LaunchAlert } from '../../modules/salon-push';
import { ALARM_KINDS, emitPush, parsePushData, registerPush, type PushData } from '@/lib/push';
import { useSession } from '@/lib/session';

/**
 * Connects push notifications to the app (phase 3): registers the phone while
 * someone is signed in, opens the alarm for a new appointment (also when it
 * arrives with the app open), and opens Randevular for other notifications.
 */
export function PushBridge() {
  const { me, business } = useSession();
  const navReady = Boolean(useRootNavigationState()?.key);
  const state = useRef({ signedIn: false, business: false });
  state.current = { signedIn: Boolean(me), business };

  // Each sign-in and app start gives the server this phone's current token.
  useEffect(() => {
    if (me?.id) void registerPush();
  }, [me?.id]);

  useEffect(() => {
    if (!SalonPush || !navReady) return;
    const showAlarm = (data: PushData, notificationId: number, action: string | null) =>
      router.push({
        pathname: '/alarm',
        params: { ...data, notificationId: String(notificationId), action: action ?? '' },
      });

    const opened = (alert: LaunchAlert) => {
      if (!state.current.signedIn) return;
      const data = parsePushData(alert.payload);
      if (ALARM_KINDS.has(data.kind ?? '')) showAlarm(data, alert.notificationId, alert.action);
      // Customer news in customer mode, salon news in business mode: both are on Randevular.
      // An announcement from our team just opens the app; a team invite opens Profil, where it is answered.
      else if (data.kind === 'announcement' || data.kind === 'team') return;
      else if (data.kind === 'invite') router.navigate('/profil');
      else if ((data.kind === 'customer') !== state.current.business) router.navigate('/randevular');
    };

    const launch = SalonPush.takeLaunchAlert();
    if (launch) opened(launch);
    const subs = [
      SalonPush.addListener('onAlert', opened),
      SalonPush.addListener('onPush', (data) => {
        const push = data as PushData;
        emitPush(push);
        // With the app open, a new request also opens the alarm screen (Android only shows a banner);
        // not outside the salon's working hours, when it arrives quietly.
        if (state.current.signedIn && push.quiet !== '1' && (push.kind === 'request' || push.kind === 'reminder')) {
          showAlarm(push, notificationIdFor(push), null);
        }
      }),
      SalonPush.addListener('onToken', () => {
        if (state.current.signedIn) void registerPush();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [navReady]);

  return null;
}

/** The same id the native side gives the notification (Alerts.notificationIdFor: Java's String.hashCode). */
function notificationIdFor(data: PushData): number {
  const key = data.appointmentId ?? `${data.title ?? ''}${data.body ?? ''}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return hash & 0x0fffffff;
}
