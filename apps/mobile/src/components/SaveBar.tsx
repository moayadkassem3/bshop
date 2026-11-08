import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from './ui';
import { colors, themed } from '@/lib/theme';

/** What a form tells its screen's save bar. */
export type SaveBarState = {
  changed: boolean;
  busy: boolean;
  /** Why it cannot be saved yet (a missing field), shown instead of saving. */
  problem: string | null;
  /** The last save failed. */
  error: string | null;
  /** Just saved: the bar says so for a moment, then leaves. */
  saved: boolean;
  save: () => void;
  reset: () => void;
};

/** How much room the bar takes, for the form's bottom spacing. */
export const SAVE_BAR_SPACE = 120;

/**
 * A bar fixed to the bottom of the screen while a form has unsaved changes:
 * Vazgeç and Kaydet, then “Değişiklikler kaydedildi” for a moment after saving.
 * Hidden otherwise. It slides up and down.
 */
export function SaveBar({ state, active = true }: { state: SaveBarState | null; active?: boolean }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = Boolean(active && state && (state.changed || state.saved));
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.value = reduced ? (visible ? 1 : 0) : withTiming(visible ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [visible, reduced, shown]);
  const animated = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 140 }] }));

  if (!state) return null;
  const note = state.problem ?? state.error;
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.bar, { paddingBottom: insets.bottom + 12 }, animated]}>
      {state.saved && !state.changed ? (
        <View style={styles.saved} accessibilityLiveRegion="polite">
          <View style={styles.tick}>
            <Text size={14} weight="bold" color={colors.white}>
              ✓
            </Text>
          </View>
          <Text weight="bold" color={colors.success}>
            Değişiklikler kaydedildi
          </Text>
        </View>
      ) : (
        <>
          <Text size={13} weight={note ? 'semibold' : 'medium'} color={state.problem ? colors.warning : state.error ? colors.danger : colors.muted}>
            {note ?? 'Kaydedilmemiş değişiklikleriniz var.'}
          </Text>
          <View style={styles.row}>
            <Button kind="secondary" title="Vazgeç" onPress={state.reset} disabled={state.busy} style={{ flex: 1 }} />
            <Button title={state.busy ? 'Kaydediliyor…' : 'Kaydet'} onPress={state.save} busy={state.busy} disabled={state.busy || Boolean(state.problem)} style={{ flex: 2 }} />
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    row: { flexDirection: 'row', gap: 10 },
    saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 50 },
    tick: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  }),
);
