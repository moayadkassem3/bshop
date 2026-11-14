import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { HeaderPattern } from './HeaderPattern';
import { Icon, type IconName } from './Icon';
import { useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { revealFocusedField, useKeyboardRoom } from '@/lib/keyboard';
import { colors, fonts, radius, shadow, themed, themeScheme } from '@/lib/theme';
import { FocusIn } from './motion';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';

/** Text in Inter: weights are separate font files, so they are chosen by name, not fontWeight. */
export function Text(props: { children?: ReactNode; size?: number; weight?: Weight; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; center?: boolean }) {
  const size = props.size ?? 15;
  return (
    <RNText
      numberOfLines={props.numberOfLines}
      style={[
        { fontFamily: fonts[props.weight ?? 'regular'], fontSize: size, lineHeight: Math.round(size * 1.4), color: props.color ?? colors.ink },
        props.center && { textAlign: 'center' },
        props.style,
      ]}
    >
      {props.children}
    </RNText>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'ghost';

/** A large touch target with a light press feedback (scale and haptic), like the website's buttons. */
export function Button(props: { title: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean; icon?: IconName }) {
  const kind = props.kind ?? 'primary';
  const disabled = props.disabled || props.busy;
  const palette: Record<ButtonKind, { bg: string; border: string; fg: string }> = {
    primary: { bg: colors.primary, border: colors.primary, fg: colors.white },
    secondary: { bg: colors.surface, border: colors.line, fg: colors.ink },
    danger: { bg: colors.dangerStrong, border: colors.dangerStrong, fg: colors.white },
    dangerOutline: { bg: colors.surface, border: colors.dangerLine, fg: colors.danger },
    ghost: { bg: 'transparent', border: 'transparent', fg: colors.primary },
  };
  // A filled button that cannot be pressed yet is grey with readable text, not a washed-out
  // colour with white text (review, 12 November 2026). While busy it keeps its colour.
  const greyed = Boolean(props.disabled) && !props.busy && (kind === 'primary' || kind === 'danger');
  const c = greyed ? { bg: colors.line, border: colors.line, fg: colors.muted } : palette[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        props.onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        props.small && styles.buttonSmall,
        { backgroundColor: c.bg, borderColor: c.border, opacity: greyed ? 1 : props.busy ? 0.7 : disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        props.style,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {props.icon ? <Icon name={props.icon} size={props.small ? 16 : 19} color={c.fg} strokeWidth={2} /> : null}
          <Text weight="bold" size={props.small ? 14 : 15} color={c.fg}>
            {props.title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card(props: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (props.onPress) {
    return (
      <Pressable onPress={props.onPress} style={({ pressed }) => [styles.card, shadow, pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] }, props.style]}>
        {props.children}
      </Pressable>
    );
  }
  return <View style={[styles.card, shadow, props.style]}>{props.children}</View>;
}

const TONES = themed(() => ({
  info: { bg: colors.primarySoft, fg: themeScheme() === 'dark' ? colors.primaryLight : colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  muted: { bg: colors.surface2, fg: colors.muted },
}));
export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'muted';

export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.badge, { backgroundColor: TONES[tone].bg }]}>
      <Text size={12} weight="semibold" color={TONES[tone].fg}>
        {label}
      </Text>
    </View>
  );
}

export function Alert({ text, tone = 'danger' }: { text: string; tone?: Tone }) {
  return (
    <View style={[styles.alert, { backgroundColor: TONES[tone].bg }]}>
      <Text size={14} color={TONES[tone].fg}>
        {text}
      </Text>
    </View>
  );
}

/**
 * A screen: the dark header of the website (title, subtitle, extra content)
 * over a scrolling body with pull-to-refresh.
 */
export function Screen(props: {
  title: string;
  subtitle?: string;
  header?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  refreshing?: boolean;
  back?: ReactNode;
  /** A bar fixed to the bottom (a save button); the page leaves room for it. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const keyboard = useKeyboardRoom(scroll);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScrollView
        ref={scroll}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: (props.footer ? 130 + insets.bottom : 32) + keyboard.room }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          props.onRefresh ? <RefreshControl refreshing={Boolean(props.refreshing)} onRefresh={() => void props.onRefresh?.()} tintColor={colors.primary} colors={[colors.primary]} /> : undefined
        }
      >
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <HeaderPattern />
          {props.back}
          <Text size={30} weight="heavy" color={colors.white} style={{ letterSpacing: -0.6 }}>
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text size={15} color={colors.darkMuted}>
              {props.subtitle}
            </Text>
          ) : null}
          {props.header}
        </View>
        <FocusIn style={styles.body}>{props.children}</FocusIn>
      </ScrollView>
      {/* The status bar keeps the header's dark colour while the page scrolls under it. */}
      <View pointerEvents="none" style={[styles.statusBand, { height: insets.top }]} />
      {props.footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{props.footer}</View> : null}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
        onFocus={(e) => {
          revealFocusedField();
          rest.onFocus?.(e);
        }}
      />
    </View>
  );
}

/** Two or more options in a dark pill, like the website's Talepler | Takvim switch. */
export function Segmented<T extends string>(props: { options: { value: T; label: string; badge?: number; icon?: IconName }[]; value: T; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <View style={[styles.segmented, props.dark && { backgroundColor: colors.dark2 }]}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              props.onChange(o.value);
            }}
            style={[styles.segment, on && { backgroundColor: colors.primary }]}
          >
            {o.icon ? <Icon name={o.icon} size={18} color={on ? colors.white : props.dark ? colors.darkMuted : colors.ink2} /> : null}
            <Text weight="bold" size={15} color={on ? colors.white : props.dark ? colors.darkMuted : colors.ink2}>
              {o.label}
            </Text>
            {o.badge ? (
              <View style={styles.segBadge}>
                <Text size={11} weight="bold" color={colors.white}>
                  {o.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A choice chip. On light pages the chosen one is ink; on the dark header (`dark`) the chosen one is
 * the brand blue and the others dark grey, so the choice stands out (founder, 5 November 2026).
 */
export function Chip(props: { label: string; on: boolean; onPress: () => void; dark?: boolean }) {
  const bg = props.dark ? (props.on ? colors.primary : colors.dark2) : props.on ? colors.chipOn : colors.surface;
  const border = props.dark ? (props.on ? colors.primary : '#2c323c') : props.on ? colors.chipOn : colors.line;
  const fg = props.dark ? (props.on ? colors.white : colors.darkMuted) : props.on ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: props.on }}
      onPress={() => {
        if (!props.on) Haptics.selectionAsync().catch(() => undefined);
        props.onPress();
      }}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, borderColor: border }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <Text size={14} weight={props.on ? 'bold' : 'semibold'} color={fg}>
        {props.on && props.dark ? '✓ ' : ''}
        {props.label}
      </Text>
    </Pressable>
  );
}

/** An empty list (as on the website): an icon in a soft blue circle, a title, a line and an action. */
export function Empty(props: { title: string; text?: string; icon?: IconName; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 28 }}>
      {props.icon ? (
        <View style={styles.emptyIcon}>
          <Icon name={props.icon} size={28} color={colors.primary} strokeWidth={2} />
        </View>
      ) : null}
      <Text size={18} weight="bold" center>
        {props.title}
      </Text>
      {props.text ? (
        <Text color={colors.muted} center>
          {props.text}
        </Text>
      ) : null}
      {props.children}
    </Card>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 32 }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    button: { minHeight: 50, paddingHorizontal: 20, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    buttonSmall: { minHeight: 40, paddingHorizontal: 14 },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
    alert: { padding: 12, borderRadius: radius.sm },
    header: { backgroundColor: colors.night, paddingHorizontal: 16, paddingBottom: 22, gap: 6 },
    body: { padding: 16, gap: 12 },
    emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: 10 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
    statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.night },
    input: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.line,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: colors.ink,
    },
    segmented: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.sm, backgroundColor: colors.surface2, marginTop: 10 },
    segment: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    segBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.dangerStrong, alignItems: 'center', justifyContent: 'center' },
    chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  }),
);
