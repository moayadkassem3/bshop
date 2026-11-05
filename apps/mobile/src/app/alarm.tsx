import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SalonPush } from '../../modules/salon-push';
import { Icon } from '@/components/Icon';
import { PopIn } from '@/components/motion';
import { Alert, Button, Text } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { ANSWERABLE_KINDS } from '@/lib/push';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

type Params = { kind?: string; title?: string; body?: string; shopId?: string; appointmentId?: string; notificationId?: string; action?: string };
type State = 'open' | 'confirm' | 'decline' | 'confirmed' | 'declined';

/**
 * The new-appointment alarm (phase 3): opened by the full-screen notification,
 * over the lock screen if the phone is locked, or by its Onayla / Reddet
 * buttons. A request is answered here; the ringing stops when this closes.
 */
export default function AlarmScreen() {
  const p = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const { business, switchMode } = useSession();
  const [state, setState] = useState<State>('open');
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerable = ANSWERABLE_KINDS.has(p.kind ?? '') && Boolean(p.shopId && p.appointmentId);
  const started = useRef(false);

  const silence = () => {
    if (p.notificationId) SalonPush?.dismiss(Number(p.notificationId));
  };
  const close = (to?: '/randevular') => {
    silence();
    SalonPush?.releaseLockScreen();
    if (to) router.replace(to);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Leaving this screen in any way stops the ringing and the lock-screen view.
  useEffect(
    () => () => {
      silence();
      SalonPush?.releaseLockScreen();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function answer(action: 'confirm' | 'decline') {
    silence();
    setError(null);
    setState(action);
    const path = `/staff/shops/${p.shopId}/appointments/${p.appointmentId}/${action}`;
    try {
      try {
        await api(path, { method: 'POST', body: {} });
      } catch (err) {
        // The app was in customer mode: business mode answers it.
        if (!(err instanceof ApiError && err.status === 403) || business) throw err;
        await switchMode('business');
        await api(path, { method: 'POST', body: {} });
      }
      setState(action === 'confirm' ? 'confirmed' : 'declined');
    } catch (err) {
      setError(errorMessage(err));
      setState('open');
    }
  }

  // Onayla / Reddet tapped on the notification itself.
  useEffect(() => {
    if (started.current || !answerable) return;
    started.current = true;
    if (p.action === 'onayla') void answer('confirm');
    else if (p.action === 'reddet') void answer('decline');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = state === 'confirmed' || state === 'declined';
  const busy = state === 'confirm' || state === 'decline';

  return (
    <View style={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.middle}>
        {done ? (
          <PopIn>
            <View style={[styles.ring, { backgroundColor: state === 'confirmed' ? colors.success : colors.dark2 }]}>
              <Text size={44} weight="bold" color={colors.white}>
                {state === 'confirmed' ? '✓' : '×'}
              </Text>
            </View>
          </PopIn>
        ) : (
          <Pulse />
        )}
        <Text size={26} weight="heavy" color={colors.white} center>
          {state === 'confirmed' ? 'Randevu onaylandı' : state === 'declined' ? 'Talep reddedildi' : (p.title ?? 'Yeni randevu')}
        </Text>
        {p.body ? (
          <Text size={17} color={colors.darkMuted} center style={{ lineHeight: 25 }}>
            {p.body}
          </Text>
        ) : null}
        {done ? (
          <Text size={15} color={colors.darkMuted} center>
            Müşteriye SMS ile bildirildi.
          </Text>
        ) : null}
        {error ? <Alert text={error} /> : null}
      </View>

      <View style={{ gap: 10 }}>
        {answerable && !done ? (
          sure ? (
            <>
              <Text size={14} color={colors.darkMuted} center>
                Talep reddedilecek; müşteriye SMS ile bildirilir.
              </Text>
              <View style={styles.row}>
                <Button kind="secondary" title="Vazgeç" onPress={() => setSure(false)} disabled={busy} style={{ flex: 1 }} />
                <Button kind="danger" title="Evet, reddet" onPress={() => void answer('decline')} busy={state === 'decline'} disabled={busy} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Button kind="dangerOutline" title="Reddet" onPress={() => setSure(true)} disabled={busy} style={{ flex: 1 }} />
              <Button title="Onayla" onPress={() => void answer('confirm')} busy={state === 'confirm'} disabled={busy} style={{ flex: 1.4 }} />
            </View>
          )
        ) : null}
        <Button kind="secondary" title="Randevulara git" onPress={() => close('/randevular')} disabled={busy} />
        <Pressable accessibilityRole="button" onPress={() => close()} disabled={busy} hitSlop={8} style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}>
          <Text weight="semibold" color={colors.white} center>
            {done || !answerable ? 'Kapat' : 'Sonra yanıtla'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The ringing bell: a soft pulse around the calendar icon. */
function Pulse() {
  const reduced = useReducedMotion();
  const wave = useSharedValue(0);
  useEffect(() => {
    if (!reduced) wave.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduced, wave]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - wave.value), transform: [{ scale: 1 + wave.value * 0.6 }] }));
  return (
    <View style={styles.pulse}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.wave, ring]} />
      <View style={styles.ring}>
        <Icon name="randevular" size={44} color={colors.white} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 20, justifyContent: 'space-between' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  row: { flexDirection: 'row', gap: 10 },
  later: { paddingVertical: 12 },
  pulse: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  wave: { borderRadius: 56, backgroundColor: colors.primary },
  ring: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
});
