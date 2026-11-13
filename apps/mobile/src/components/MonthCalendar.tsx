import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, themed } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './ui';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const CELL = 46;

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11" one month on or back. */
export function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The weeks of a month, Monday first; null for the days of the neighbouring months. */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export const monthTitle = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/**
 * Takvim's month view (founder, 14 November 2026): slides down under the date when the date
 * is tapped. Each day shows how many appointments it has; tapping a day shows that day below.
 */
export function MonthCalendar(props: {
  open: boolean;
  month: string;
  selected: string;
  today: string;
  /** Appointments per day (YYYY-MM-DD), without declined and cancelled ones; null while loading. */
  counts: Record<string, number> | null;
  onMonth: (month: string) => void;
  onPick: (date: string) => void;
}) {
  const weeks = monthWeeks(props.month);
  const height = 52 + 24 + weeks.length * CELL + 14;
  const reduced = useReducedMotion();
  const shown = useSharedValue(props.open ? 1 : 0);
  useEffect(() => {
    shown.value = reduced ? (props.open ? 1 : 0) : withTiming(props.open ? 1 : 0, { duration: props.open ? 240 : 180, easing: props.open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic) });
  }, [props.open, reduced, shown]);
  // The card grows downwards from the date, and its content slides down with it.
  const box = useAnimatedStyle(() => ({ height: shown.value * height, opacity: shown.value, marginTop: (shown.value - 1) * 12 }), [height]);
  const inner = useAnimatedStyle(() => ({ transform: [{ translateY: (shown.value - 1) * 24 }] }));

  return (
    <Animated.View style={[{ overflow: 'hidden' }, box]} pointerEvents={props.open ? 'auto' : 'none'} accessibilityElementsHidden={!props.open}>
      <Animated.View style={[styles.card, { height }, inner]}>
        <View style={styles.head}>
          <Pressable onPress={() => props.onMonth(addMonths(props.month, -1))} hitSlop={8} style={styles.arrow} accessibilityLabel="Önceki ay">
            <Icon name="back" size={18} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
          <Text weight="heavy" size={16}>
            {monthTitle(props.month)}
          </Text>
          <Pressable onPress={() => props.onMonth(addMonths(props.month, 1))} hitSlop={8} style={styles.arrow} accessibilityLabel="Sonraki ay">
            <Icon name="chevron" size={18} color={colors.ink} strokeWidth={2.2} />
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((d) => (
            <Text key={d} size={12} weight="bold" color={colors.muted} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((day, i) => {
              if (!day) return <View key={i} style={styles.cell} />;
              const on = day === props.selected;
              const count = props.counts?.[day] ?? 0;
              return (
                <Pressable
                  key={day}
                  onPress={() => props.onPick(day)}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${Number(day.slice(8))} ${monthTitle(props.month)}${count ? `, ${count} randevu` : ''}`}
                >
                  <View style={[styles.day, day === props.today && styles.today, on && styles.dayOn]}>
                    <Text size={15} weight={on || day === props.today ? 'heavy' : 'semibold'} color={on ? colors.white : colors.ink}>
                      {Number(day.slice(8))}
                    </Text>
                    {count ? (
                      <Text size={10} weight="heavy" color={on ? colors.white : colors.primary} style={{ marginTop: -2 }}>
                        {count}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { paddingHorizontal: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
    head: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
    arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
    week: { flexDirection: 'row' },
    weekday: { flex: 1, height: 24, textAlign: 'center' },
    cell: { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center' },
    day: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    today: { borderWidth: 1.5, borderColor: colors.primary },
    dayOn: { backgroundColor: colors.primary },
  }),
);
