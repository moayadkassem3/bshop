import * as Haptics from 'expo-haptics';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BlurView } from 'expo-blur';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, themed, themeScheme } from '@/lib/theme';
import { Icon, type IconName } from './Icon';
import { Button, Text } from './ui';

/**
 * The app's own dialogs (founder, 9 November 2026), in place of Android's grey system
 * alerts: `confirm()` asks before an action (a card in the middle, red for actions that
 * remove or cancel something) and `chooseAction()` offers choices in a sheet from the
 * bottom (icon rows like Profil's menu). Rendered once by <DialogHost /> in the root layout.
 */

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** The action's button, e.g. "Reddet". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Removes, cancels or declines something: a red button and icon. */
  danger?: boolean;
  icon?: IconName;
  onConfirm: () => void;
};

export type SheetOption = { label: string; icon: IconName; danger?: boolean; onPress: () => void };
export type SheetOptions = { title: string; message?: string; options: SheetOption[] };

type Open = { kind: 'confirm'; options: ConfirmOptions } | { kind: 'sheet'; options: SheetOptions } | null;

let open: Open = null;
const listeners = new Set<() => void>();
const set = (next: Open) => {
  open = next;
  listeners.forEach((l) => l());
};

export function confirm(options: ConfirmOptions) {
  Haptics.selectionAsync().catch(() => undefined);
  set({ kind: 'confirm', options });
}

export function chooseAction(options: SheetOptions) {
  Haptics.selectionAsync().catch(() => undefined);
  set({ kind: 'sheet', options });
}

export function DialogHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
  const reduced = useReducedMotion();
  // Kept drawn while it animates out after closing.
  const [shown, setShown] = useState<Open>(null);
  // 0 hidden → 1 open: drives the blurred, dimmed background, the card's pop and the sheet's slide.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (current) {
      setShown(current);
      progress.value = reduced ? 1 : withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else if (reduced) {
      progress.value = 0;
      setShown(null);
    } else {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(setShown)(null);
      });
    }
  }, [current, progress, reduced]);

  // Android's back button closes the dialog instead of leaving the screen.
  useEffect(() => {
    if (!current) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      set(null);
      return true;
    });
    return () => sub.remove();
  }, [current]);

  const close = () => set(null);
  // The action runs once the dialog has started closing, so a screen change does not stack on it.
  const run = (action: () => void) => {
    close();
    setTimeout(action, 0);
  };
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!shown) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={current ? 'auto' : 'none'}>
      {/* A little blur and a little dimming over the screen behind (founder, 9 November 2026). */}
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]} pointerEvents="none">
        <BlurView style={StyleSheet.absoluteFill} intensity={Platform.OS === 'android' ? 24 : 16} tint={themeScheme() === 'dark' ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Animated.View>
      {shown.kind === 'confirm' ? <ConfirmCard key={shown.options.title} o={shown.options} progress={progress} onCancel={close} onConfirm={() => run(shown.options.onConfirm)} /> : null}
      {shown.kind === 'sheet' ? <Sheet key={shown.options.title} o={shown.options} progress={progress} onCancel={close} onChoose={(opt) => run(opt.onPress)} /> : null}
    </View>
  );
}

function ConfirmCard({ o, progress, onCancel, onConfirm }: { o: ConfirmOptions; progress: SharedValue<number>; onCancel: () => void; onConfirm: () => void }) {
  const pop = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.92 + 0.08 * progress.value }] }));
  const tint = o.danger ? colors.danger : colors.primary;
  return (
    <View style={styles.center}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Kapat" />
      <Animated.View style={[styles.card, pop]} accessibilityViewIsModal accessibilityRole="alert">
        <View style={[styles.badge, { backgroundColor: o.danger ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={o.icon ?? (o.danger ? 'close' : 'check')} size={26} color={tint} strokeWidth={2.2} />
        </View>
        <Text size={20} weight="heavy" style={{ textAlign: 'center' }}>
          {o.title}
        </Text>
        {o.message ? (
          <Text size={15} color={colors.muted} style={{ textAlign: 'center', lineHeight: 21 }}>
            {o.message}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button kind="secondary" title={o.cancelLabel ?? 'Vazgeç'} onPress={onCancel} style={{ flex: 1 }} />
          <Button kind={o.danger ? 'danger' : 'primary'} title={o.confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
        </View>
      </Animated.View>
    </View>
  );
}

function Sheet({ o, progress, onCancel, onChoose }: { o: SheetOptions; progress: SharedValue<number>; onCancel: () => void; onChoose: (option: SheetOption) => void }) {
  const insets = useSafeAreaInsets();
  // The sheet's own height, so it slides fully out of view.
  const height = useSharedValue(420);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height.value }] }));
  return (
    <View style={styles.bottom}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Kapat" />
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, slide]}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height + 24;
        }}
        accessibilityViewIsModal
      >
        <View style={styles.handle} />
        <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 6 }}>
          <Text size={19} weight="heavy">
            {o.title}
          </Text>
          {o.message ? (
            <Text size={14} color={colors.muted}>
              {o.message}
            </Text>
          ) : null}
        </View>
        <View style={styles.options}>
          {o.options.map((opt, i) => (
            <Pressable
              key={opt.label}
              accessibilityRole="button"
              onPress={() => onChoose(opt)}
              style={({ pressed }) => [styles.option, i < o.options.length - 1 && styles.optionLine, pressed && { backgroundColor: colors.surface2 }]}
            >
              <View style={[styles.optionIcon, opt.danger && { backgroundColor: colors.dangerSoft }]}>
                <Icon name={opt.icon} size={20} color={opt.danger ? colors.danger : colors.primary} />
              </View>
              <Text size={16} weight="semibold" color={opt.danger ? colors.danger : colors.ink} style={{ flex: 1 }}>
                {opt.label}
              </Text>
              <Icon name="chevron" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
        <Button kind="secondary" title="Vazgeç" onPress={onCancel} />
      </Animated.View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      gap: 10,
      padding: 22,
      paddingTop: 26,
      borderRadius: radius.md + 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 10 },
    bottom: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
    sheet: {
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.line,
    },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.line, marginBottom: 6 },
    options: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface },
    option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, minHeight: 60 },
    optionLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
    optionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  }),
);
