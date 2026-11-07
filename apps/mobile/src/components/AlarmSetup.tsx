import { useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, View } from 'react-native';
import { SalonPush, type PushStatus } from '../../modules/salon-push';
import { Button, Card, Text } from './ui';
import { colors } from '@/lib/theme';

/**
 * Salonum: shown only when the phone would not ring for a new appointment
 * (notifications off, the alarm channel silenced, or, on Android 14+, full-screen
 * alerts not allowed), with the setting that fixes it.
 */
export function AlarmSetup() {
  const [status, setStatus] = useState<PushStatus | null>(() => SalonPush?.status() ?? null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setStatus(SalonPush?.status() ?? null);
    });
    return () => sub.remove();
  }, []);
  if (!SalonPush || !status) return null;
  const notificationsOff = !status.notificationsEnabled || !status.alarmChannelEnabled;
  if (!notificationsOff && status.canUseFullScreenIntent) return null;

  async function allowNotifications() {
    if (!status?.notificationsEnabled && Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      setStatus(SalonPush?.status() ?? null);
      if (result === PermissionsAndroid.RESULTS.GRANTED && status?.alarmChannelEnabled) return;
    }
    SalonPush?.openNotificationSettings();
  }

  return (
    <Card style={{ gap: 10, borderColor: '#f3d6b0', backgroundColor: colors.warningSoft }}>
      <Text weight="bold">{notificationsOff ? 'Randevu alarmı kapalı' : 'Kilit ekranında alarm kapalı'}</Text>
      <Text size={14} color={colors.ink2}>
        {notificationsOff
          ? 'Bildirimler kapalı olduğu için yeni randevu talepleri bu telefonda çalmaz.'
          : 'Yeni randevu talepleri telefon kilitliyken tam ekran açılmaz; yalnızca bildirim olarak gelir.'}
      </Text>
      <View style={{ gap: 8 }}>
        {notificationsOff ? <Button small title="Bildirimleri aç" onPress={() => void allowNotifications()} /> : null}
        {!status.canUseFullScreenIntent ? (
          <Button small kind={notificationsOff ? 'secondary' : 'primary'} title="Tam ekran alarma izin ver" onPress={() => SalonPush?.openFullScreenSettings()} />
        ) : null}
      </View>
    </Card>
  );
}
