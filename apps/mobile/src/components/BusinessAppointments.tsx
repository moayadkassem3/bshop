import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { addDays, dayStart, formatLongDate, turkeyDate } from '@/lib/format';
import { colors, radius, themed } from '@/lib/theme';
import type { Member, ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { Icon } from './Icon';
import { addMonths, MonthCalendar, monthTitle } from './MonthCalendar';
import { ShopAppointmentCard } from './ShopAppointmentCard';
import { BlockForm, TimeOffCard, type TimeOff } from './TimeBlocks';
import { ShopPicker } from './ShopPicker';
import { Appear, SkeletonList, SlideIn } from './motion';
import { Alert, Button, Chip, Empty, Screen, Segmented, Text } from './ui';

type Tab = 'talepler' | 'takvim';

/** A sideways swipe this long (points) switches between Talepler and Takvim. */
const SWIPE = 60;

/**
 * Randevular in business mode (as on the website): requests to answer, and the
 * day's calendar. Swiping sideways anywhere on the page switches between the two,
 * like tapping them (founder request, 7 November 2026).
 */
export function BusinessAppointments() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'takvim' ? 'takvim' : 'talepler');
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [requests, setRequests] = useState<ShopAppointment[] | null>(null);
  const [date, setDate] = useState(turkeyDate(new Date()));
  const [day, setDay] = useState<ShopAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);
  const [closed, setClosed] = useState<TimeOff[]>([]);
  const [blocking, setBlocking] = useState(false);
  // Takvim's month view, opened by tapping the date (founder, 14 November 2026).
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(date.slice(0, 7));
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Leaving for another screen closes what was open here: the month view and "Saat kapat".
  useFocusEffect(
    useCallback(
      () => () => {
        setCalendar(false);
        setBlocking(false);
      },
      [],
    ),
  );

  useEffect(() => {
    if (params.tab === 'takvim') setTab('takvim');
  }, [params.tab]);

  // Which way the content slides in: forward (Takvim) from the right, back (Talepler) from the left.
  const [from, setFrom] = useState<'right' | 'left'>('right');
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const switchTo = useCallback((next: Tab) => {
    if (tabRef.current === next) return;
    setFrom(next === 'takvim' ? 'right' : 'left');
    setTab(next);
    setCalendar(false);
    setBlocking(false);
  }, []);
  // A tap on the tabs already gives a tick; a swipe gives the same one.
  const onSwipe = useCallback(
    (dx: number) => {
      const next: Tab = dx < 0 ? 'takvim' : 'talepler';
      if (tabRef.current === next) return;
      Haptics.selectionAsync().catch(() => undefined);
      switchTo(next);
    },
    [switchTo],
  );
  // Only a clearly sideways move counts: an up-and-down scroll fails it at once.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-14, 14])
        .onEnd((e) => {
          if (Math.abs(e.translationX) > SWIPE || Math.abs(e.velocityX) > 700) runOnJS(onSwipe)(e.translationX);
        }),
    [onSwipe],
  );

  // Owners can look at one person's day (as on the website); staff only see their own.
  useEffect(() => {
    setStaffId(null);
    setMembers([]);
    if (!shop || shop.role !== 'owner') return;
    api<Member[]>(`/staff/shops/${shop.id}/members`)
      .then((list) => setMembers(list.filter((m) => m.active && m.bookable)))
      .catch(() => setMembers([]));
  }, [shop]);

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      const now = new Date();
      const range = `from=${dayStart(date).toISOString()}&to=${dayStart(addDays(date, 1)).toISOString()}`;
      const [open, list, off] = await Promise.all([
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${now.toISOString()}&to=${new Date(now.getTime() + 365 * 86_400_000).toISOString()}`),
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?${range}${staffId ? `&staffId=${staffId}` : ''}`),
        api<TimeOff[]>(`/staff/shops/${shop.id}/time-off?${range}`).catch(() => [] as TimeOff[]),
      ]);
      setClosed(off.filter((t) => !staffId || t.staff_id === staffId));
      setRequests(open.filter((a) => a.status === 'pending' || a.status === 'offered'));
      setDay(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop, date, staffId]);
  const { refreshing, refresh } = usePolling(load);

  // How many appointments each day has (declined and cancelled ones aside): dots under the days
  // in the row, numbers in the month view. Covers the row's days and the month shown.
  const shopId = shop?.id;
  const today0 = turkeyDate(new Date());
  const monthEnd = turkeyDate(new Date(dayStart(`${addMonths(month, 1)}-01`).getTime() - 3_600_000));
  const rangeFrom = [addDays(today0, -STRIP_BEFORE), addDays(date, -STRIP_BEFORE), `${month}-01`].sort()[0]!;
  const rangeTo = [addDays(today0, STRIP_AFTER), addDays(date, 30), monthEnd].sort()[2]!;
  useEffect(() => {
    if (!shopId) return;
    let stale = false;
    const range = `from=${dayStart(rangeFrom).toISOString()}&to=${dayStart(addDays(rangeTo, 1)).toISOString()}`;
    api<ShopAppointment[]>(`/staff/shops/${shopId}/appointments?${range}${staffId ? `&staffId=${staffId}` : ''}`)
      .then((list) => {
        if (stale) return;
        const next: Record<string, number> = {};
        for (const a of list) {
          if (a.status === 'declined' || a.status === 'cancelled') continue;
          const d = turkeyDate(new Date(a.starts_at));
          next[d] = (next[d] ?? 0) + 1;
        }
        setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
    // `day` too: the counts follow the day's list when it is refreshed or answered.
  }, [shopId, rangeFrom, rangeTo, staffId, day]);

  const toggleCalendar = () => {
    setMonth(date.slice(0, 7));
    setCalendar((v) => !v);
  };
  // Dragging the handle down opens the month view, up closes it.
  const handleDrag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .onEnd((e) => {
          if (e.translationY > 24) runOnJS(openCalendar)(true);
          else if (e.translationY < -24) runOnJS(openCalendar)(false);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date],
  );
  function openCalendar(open: boolean) {
    if (open) setMonth(date.slice(0, 7));
    setCalendar(open);
  }

  const pending = requests?.filter((a) => a.status === 'pending').length ?? 0;
  const owner = shop?.role === 'owner';
  const today = turkeyDate(new Date());
  const active = (day ?? []).filter((a) => a.status !== 'declined' && a.status !== 'cancelled');
  const dropped = (day ?? []).filter((a) => a.status === 'declined' || a.status === 'cancelled');
  const goTo = (d: string) => {
    setDay(null);
    setClosed([]);
    setDate(d);
  };

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ flex: 1 }} collapsable={false}>
        <Screen
          title="Randevular"
          header={
            <>
              <ShopPicker shops={shops} shop={shop} onSelect={selectShop} />
              <Segmented
                dark
                value={tab}
                onChange={switchTo}
                options={[
                  { value: 'talepler', label: 'Talepler', badge: pending || undefined },
                  { value: 'takvim', label: 'Takvim' },
                ]}
              />
            </>
          }
          onRefresh={refresh}
          refreshing={refreshing}
        >
          {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
          {shop && tab === 'talepler' ? (
            <SlideIn key="talepler" from={from} style={{ gap: 12 }}>
              {!requests ? (
                <SkeletonList rows={2} />
              ) : requests.length === 0 ? (
                <Appear>
                  <Empty icon="check" title="Bekleyen talep yok" text="Yeni randevu talepleri burada görünür. Sayfa kendiliğinden yenilenir." />
                </Appear>
              ) : (
                requests.map((a, i) => (
                  <Appear key={a.id} index={i}>
                    <ShopAppointmentCard shopId={shop.id} appointment={a} showDate showStaff={owner} onChanged={load} />
                  </Appear>
                ))
              )}
            </SlideIn>
          ) : null}
          {shop && tab === 'takvim' ? (
            <SlideIn key="takvim" from={from} style={{ gap: 12 }}>
              {/* Takvim (founder's design, 14 November 2026): the month with arrows (a week at a time),
                  a row of days starting just before today so the coming days show, and the month
                  calendar sliding down from the handle (tap or drag down). */}
              <View style={styles.monthBar}>
                <Pressable accessibilityLabel="Önceki hafta" onPress={() => goTo(addDays(date, -7))} style={styles.dayButton} hitSlop={6}>
                  <Icon name="back" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Pressable
                  onPress={toggleCalendar}
                  style={({ pressed }) => [styles.monthTitle, pressed && { backgroundColor: colors.surface2 }]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: calendar }}
                  accessibilityLabel={`${monthTitle(date.slice(0, 7))}, takvimi ${calendar ? 'kapat' : 'aç'}`}
                >
                  <Text size={18} weight="heavy">
                    {monthTitle(date.slice(0, 7))}
                  </Text>
                  <View style={{ transform: [{ rotate: calendar ? '-90deg' : '90deg' }] }}>
                    <Icon name="chevron" size={14} color={colors.muted} strokeWidth={2.4} />
                  </View>
                </Pressable>
                <Pressable accessibilityLabel="Sonraki hafta" onPress={() => goTo(addDays(date, 7))} style={styles.dayButton} hitSlop={6}>
                  <Icon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
              </View>
              <DayStrip date={date} today={today} counts={counts} onPick={goTo} />
              <GestureDetector gesture={handleDrag}>
                <Pressable onPress={toggleCalendar} style={styles.handleArea} accessibilityRole="button" accessibilityLabel={calendar ? 'Takvimi kapat' : 'Takvimi aç'} hitSlop={6}>
                  <View style={styles.handle} />
                </Pressable>
              </GestureDetector>
              <MonthCalendar
                open={calendar}
                month={month}
                selected={date}
                today={today}
                counts={counts}
                onMonth={(m) => {
                  setCounts(null);
                  setMonth(m);
                }}
                onPick={(d) => {
                  goTo(d);
                  setCalendar(false);
                }}
              />
              {date !== today ? (
                <Pressable onPress={() => goTo(today)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                  <Text size={14} weight="bold" color={colors.primary}>
                    Bugüne dön
                  </Text>
                </Pressable>
              ) : null}
              {members.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Personel">
                  {[{ id: null, display_name: 'Tüm ekip' }, ...members].map((m) => (
                    <Chip
                      key={m.id ?? 'all'}
                      label={m.display_name}
                      on={staffId === m.id}
                      onPress={() => {
                        setDay(null);
                        setStaffId(m.id);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {closed.map((t) => (
                <Appear key={t.id}>
                  <TimeOffCard shopId={shop.id} item={t} date={date} showStaff={owner} onChanged={load} />
                </Appear>
              ))}
              {!day ? (
                <SkeletonList rows={2} />
              ) : active.length === 0 && closed.length === 0 ? (
                <Appear>
                  <Empty title="Randevu yok" text="Bu gün için randevu bulunmuyor." />
                </Appear>
              ) : (
                active.map((a, i) => (
                  <Appear key={a.id} index={i}>
                    <ShopAppointmentCard shopId={shop.id} appointment={a} showStaff={owner} onChanged={load} />
                  </Appear>
                ))
              )}
              {/* Saat kapat at the bottom, large (founder, 14 November 2026). */}
              {blocking ? null : (
                <Pressable onPress={() => setBlocking(true)} style={({ pressed }) => [styles.blockBig, pressed && { backgroundColor: colors.surface2 }]} accessibilityRole="button">
                  <Icon name="clock" size={20} color={colors.primary} strokeWidth={2.2} />
                  <Text size={16} weight="bold" color={colors.primary}>
                    Saat kapat
                  </Text>
                </Pressable>
              )}
              {!blocking ? null : (
                <Appear>
                  <BlockForm
                    shopId={shop.id}
                    date={date}
                    members={owner ? members : [{ id: shop.member_id, display_name: 'Siz' }]}
                    myMemberId={shop.member_id}
                    isOwner={owner}
                    onClose={() => setBlocking(false)}
                    onDone={() => {
                      setBlocking(false);
                      void load();
                    }}
                  />
                </Appear>
              )}
              {dropped.length > 0 ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showDropped }}
                    onPress={() => {
                      setShowDropped((v) => !v);
                    }}
                    style={styles.dropped}
                  >
                    <Text weight="semibold" color={colors.ink2} style={{ flex: 1 }}>
                      İptal edilen ve reddedilenler ({dropped.length})
                    </Text>
                    <View style={{ transform: [{ rotate: showDropped ? '90deg' : '0deg' }] }}>
                      <Icon name="chevron" size={18} color={colors.muted} />
                    </View>
                  </Pressable>
                  {showDropped
                    ? dropped.map((a, i) => (
                        <Appear key={a.id} index={i}>
                          <ShopAppointmentCard shopId={shop.id} appointment={a} showStaff={owner} onChanged={load} />
                        </Appear>
                      ))
                    : null}
                </>
              ) : null}
            </SlideIn>
          ) : null}
        </Screen>
      </View>
    </GestureDetector>
  );
}

/** The row of days: this many before today, and this many after (the row scrolls sideways). */
const STRIP_BEFORE = 7;
const STRIP_AFTER = 60;
const CHIP = 52;
const CHIP_GAP = 8;
const WEEKDAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/**
 * The days in a row (founder's design, 14 November 2026): weekday and date, the chosen one in
 * blue, today outlined, a dot on days with appointments. It opens with one day before the chosen
 * one at the left, so today and the days after it show.
 */
function DayStrip(props: { date: string; today: string; counts: Record<string, number> | null; onPick: (d: string) => void }) {
  const ref = useRef<RNScrollView>(null);
  const first = [addDays(props.today, -STRIP_BEFORE), addDays(props.date, -STRIP_BEFORE)].sort()[0]!;
  const last = [addDays(props.today, STRIP_AFTER), addDays(props.date, 30)].sort()[1]!;
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 400; d = addDays(d, 1)) days.push(d);
  const index = days.indexOf(props.date);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ x: Math.max(0, index - 1) * (CHIP + CHIP_GAP), animated: true }), 0);
    return () => clearTimeout(t);
  }, [index]);
  return (
    <ScrollView
      ref={ref as never}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: CHIP_GAP, paddingVertical: 2 }}
      contentOffset={{ x: Math.max(0, index - 1) * (CHIP + CHIP_GAP), y: 0 }}
      accessibilityLabel="Günler"
    >
      {days.map((d) => {
        const on = d === props.date;
        const count = props.counts?.[d] ?? 0;
        return (
          <Pressable
            key={d}
            onPress={() => props.onPick(d)}
            style={[stripStyles.chip, d === props.today && !on && stripStyles.today, on && stripStyles.on]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${formatLongDate(dayStart(d))}${count ? `, ${count} randevu` : ''}`}
          >
            <Text size={13} weight="semibold" color={on ? colors.white : colors.muted}>
              {WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]}
            </Text>
            <Text size={19} weight="heavy" color={on ? colors.white : colors.ink}>
              {Number(d.slice(8))}
            </Text>
            <View style={[stripStyles.dot, { backgroundColor: count ? (on ? colors.white : colors.primary) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const stripStyles = themed(() =>
  StyleSheet.create({
    chip: { width: CHIP, height: 74, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
    today: { borderColor: colors.primary },
    on: { backgroundColor: colors.primary, borderColor: colors.primary },
    dot: { width: 5, height: 5, borderRadius: 3 },
  }),
);

const styles = themed(() =>
  StyleSheet.create({
    monthBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    monthTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: radius.sm },
    handleArea: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 6, marginTop: -4 },
    handle: { width: 44, height: 5, borderRadius: radius.pill, backgroundColor: colors.line },
    blockBig: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 64,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    dropped: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
    dayButton: { width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  }),
);
