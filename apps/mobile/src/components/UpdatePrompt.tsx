import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { api } from '@/lib/api';
import { BRAND_NAVY, colors, radius, themed, themeScheme } from '@/lib/theme';
import { LogoMark } from './LogoMark';
import { Button, Text } from './ui';

type Versions = { android: { latest: string | null }; ios: { latest: string | null; url: string | null } };

const STORE = Platform.OS === 'ios' ? 'ios' : 'android';
const INSTALLED = Constants.expoConfig?.version ?? '0';
const PACKAGE = Constants.expoConfig?.android?.package ?? 'com.salonrandevu.app';

/** "1.10.0" is newer than "1.9.3": compared number by number. */
export function isNewer(latest: string, installed: string): boolean {
  const a = latest.split('.').map(Number);
  const b = installed.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

async function openStore(iosUrl: string | null) {
  if (STORE === 'ios') {
    if (iosUrl) await Linking.openURL(iosUrl);
    return;
  }
  // The Play Store app when the phone has it, its web page otherwise.
  await Linking.openURL(`market://details?id=${PACKAGE}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE}`));
}

/**
 * "Yeni sürüm hazır" (founder, 13 November 2026): a large pop-up when the store has a newer
 * version than the one installed. The server says which version is newest
 * (`/public/app-version`, set by our team once a release is live); the app asks when it opens
 * and when it comes back to the front. "Daha sonra" closes it until the app is opened again.
 */
export function UpdatePrompt() {
  const [update, setUpdate] = useState<{ version: string; iosUrl: string | null } | null>(null);
  const [shown, setShown] = useState(false);
  const dismissed = useRef(false);
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    const check = () => {
      if (dismissed.current) return;
      api<Versions>('/public/app-version')
        .then((v) => {
          const latest = v[STORE].latest;
          // iOS needs the App Store link to send people to.
          if (latest && isNewer(latest, INSTALLED) && (STORE === 'android' || v.ios.url)) setUpdate({ version: latest, iosUrl: v.ios.url });
        })
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (update) {
      setShown(true);
      progress.value = reduced ? 1 : withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else if (reduced) {
      progress.value = 0;
      setShown(false);
    } else {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setShown)(false);
      });
    }
  }, [update, progress, reduced]);

  const later = () => {
    dismissed.current = true;
    setUpdate(null);
  };

  // Android's back button means "later", not leaving the screen underneath.
  useEffect(() => {
    if (!update) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      later();
      return true;
    });
    return () => sub.remove();
  }, [update]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const pop = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.9 + 0.1 * progress.value }] }));
  // Kept while the pop-up animates out.
  const last = useRef(update);
  if (update) last.current = update;
  const u = last.current;

  if (!shown || !u) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={update ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
        <BlurView style={StyleSheet.absoluteFill} intensity={Platform.OS === 'android' ? 24 : 16} tint={themeScheme() === 'dark' ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Animated.View>
      <View style={styles.center}>
        <Animated.View style={[styles.card, pop]} accessibilityViewIsModal accessibilityRole="alert">
          <View style={styles.badge}>
            <LogoMark size={54} color={colors.white} />
          </View>
          <Text size={26} weight="heavy" style={{ textAlign: 'center', letterSpacing: -0.4 }}>
            Yeni sürüm hazır
          </Text>
          <Text size={16} color={colors.muted} style={{ textAlign: 'center', lineHeight: 23 }}>
            Uygulamanın yeni sürümü yayınlandı. En iyi deneyim için güncelleyin.
          </Text>
          <Text size={13} weight="semibold" color={colors.muted} style={{ textAlign: 'center' }}>
            Sürüm {u.version}
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 14 }}>
            <Button title="Güncelle" onPress={() => void openStore(u.iosUrl).catch(() => undefined)} />
            <Button kind="secondary" title="Daha sonra" onPress={later} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 22 },
    card: {
      width: '100%',
      maxWidth: 420,
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 24,
      paddingTop: 34,
      paddingBottom: 24,
      borderRadius: radius.md + 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      boxShadow: `0px 12px 32px ${colors.dialogShadow}`,
    },
    badge: { width: 104, height: 104, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: BRAND_NAVY },
  }),
);
