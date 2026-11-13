import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { addDays, dayStart, formatLongDate, turkeyDate } from '@/lib/format';
import { colors, radius, themed } from '@/lib/theme';
import type { Member, ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { Icon } from './Icon';
import { addMonths, MonthCalendar } from './MonthCalendar';
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

  // How many appointments each day of the shown month has (declined and cancelled ones aside).
  const shopId = shop?.id;
  useEffect(() => {
    if (!calendar || !shopId) return;
    let stale = false;
    const range = `from=${dayStart(`${month}-01`).toISOString()}&to=${dayStart(`${addMonths(month, 1)}-01`).toISOString()}`;
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
  }, [calendar, shopId, month, staffId, day]);

  const pending = requests?.filter((a) => a.status === 'pending').length ?? 0;
  const owner = shop?.role === 'owner';
  const today = turkeyDate(new Date());
  const dayLabel = date === today ? 'Bugün' : date === addDays(today, 1) ? 'Yarın' : date === addDays(today, -1) ? 'Dün' : '';
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
              <View style={styles.dayBar}>
                <Pressable accessibilityLabel="Önceki gün" onPress={() => goTo(addDays(date, -1))} style={styles.dayButton} hitSlop={6}>
                  <Icon name="back" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.dayTitle, pressed && { backgroundColor: colors.surface2 }]}
                  onPress={() => {
                    setMonth(date.slice(0, 7));
                    setCalendar((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: calendar }}
                  accessibilityLabel={`${formatLongDate(dayStart(date))}, takvimi ${calendar ? 'kapat' : 'aç'}`}
                >
                  {dayLabel ? (
                    <Text weight="bold" size={17}>
                      {dayLabel}
                    </Text>
                  ) : null}
                  <Text size={dayLabel ? 13 : 17} weight={dayLabel ? 'regular' : 'bold'} color={dayLabel ? colors.muted : colors.ink}>
                    {formatLongDate(dayStart(date))}
                  </Text>
                  <View style={[styles.dayCaret, { transform: [{ rotate: calendar ? '-90deg' : '90deg' }] }]}>
                    <Icon name="chevron" size={14} color={colors.muted} strokeWidth={2.4} />
                  </View>
                </Pressable>
                <Pressable accessibilityLabel="Sonraki gün" onPress={() => goTo(addDays(date, 1))} style={styles.dayButton} hitSlop={6}>
                  <Icon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
                </Pressable>
              </View>
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
                onPick={goTo}
              />
              {/* Under the date: back to today, and a small "Saat kapat" (it used to be a
                  full-width button above the list; review, 12 November 2026). */}
              <View style={styles.dayTools}>
                {date !== today ? (
                  <Pressable onPress={() => goTo(today)} hitSlop={8}>
                    <Text size={14} weight="bold" color={colors.primary}>
                      Bugüne dön
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                {!blocking ? (
                  <Pressable onPress={() => setBlocking(true)} hitSlop={6} style={({ pressed }) => [styles.blockLink, pressed && { backgroundColor: colors.surface2 }]}>
                    <Icon name="clock" size={16} color={colors.ink} />
                    <Text size={14} weight="bold">
                      Saat kapat
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {members.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Personel">
                  {[{ id: null, display_name: 'Herkes' }, ...members].map((m) => (
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

const styles = themed(() =>
  StyleSheet.create({
    dayTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
    blockLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    dayBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dayTitle: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 22, borderRadius: radius.sm },
    dayCaret: { position: 'absolute', right: 6, top: '50%', marginTop: -7 },
    dropped: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
    dayButton: { width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  }),
);
