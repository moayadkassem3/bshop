import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { addDays, dayStart, formatLongDate, turkeyDate } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Member, ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { Icon } from './Icon';
import { ShopAppointmentCard } from './ShopAppointmentCard';
import { ShopPicker } from './ShopPicker';
import { Appear, SkeletonList } from './motion';
import { Alert, Chip, Empty, Screen, Segmented, Text } from './ui';

type Tab = 'talepler' | 'takvim';

/** Randevular in business mode (as on the website): requests to answer, and the day's calendar. */
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

  useEffect(() => {
    if (params.tab === 'takvim') setTab('takvim');
  }, [params.tab]);

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
      const [open, list] = await Promise.all([
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${now.toISOString()}&to=${new Date(now.getTime() + 365 * 86_400_000).toISOString()}`),
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${dayStart(date).toISOString()}&to=${dayStart(addDays(date, 1)).toISOString()}${staffId ? `&staffId=${staffId}` : ''}`),
      ]);
      setRequests(open.filter((a) => a.status === 'pending' || a.status === 'offered'));
      setDay(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop, date, staffId]);
  const { refreshing, refresh } = usePolling(load);

  const pending = requests?.filter((a) => a.status === 'pending').length ?? 0;
  const owner = shop?.role === 'owner';
  const today = turkeyDate(new Date());
  const dayLabel = date === today ? 'Bugün' : date === addDays(today, 1) ? 'Yarın' : date === addDays(today, -1) ? 'Dün' : '';
  const active = (day ?? []).filter((a) => a.status !== 'declined' && a.status !== 'cancelled');
  const dropped = (day ?? []).filter((a) => a.status === 'declined' || a.status === 'cancelled');
  const goTo = (d: string) => {
    setDay(null);
    setDate(d);
  };

  return (
    <Screen
      title="Randevular"
      header={
        <>
          <ShopPicker shops={shops} shop={shop} onSelect={selectShop} />
          <Segmented
            dark
            value={tab}
            onChange={setTab}
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
        !requests ? (
          <SkeletonList rows={2} />
        ) : requests.length === 0 ? (
          <Appear>
            <Empty title="Bekleyen talep yok" text="Yeni randevu talepleri burada görünür. Sayfa kendiliğinden yenilenir." />
          </Appear>
        ) : (
          requests.map((a, i) => (
            <Appear key={a.id} index={i}>
              <ShopAppointmentCard shopId={shop.id} appointment={a} showDate showStaff={owner} onChanged={load} />
            </Appear>
          ))
        )
      ) : null}
      {shop && tab === 'takvim' ? (
        <>
          <View style={styles.dayBar}>
            <Pressable accessibilityLabel="Önceki gün" onPress={() => goTo(addDays(date, -1))} style={styles.dayButton} hitSlop={6}>
              <Icon name="back" size={20} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              {dayLabel ? (
                <Text weight="bold" size={17}>
                  {dayLabel}
                </Text>
              ) : null}
              <Text size={dayLabel ? 13 : 17} weight={dayLabel ? 'regular' : 'bold'} color={dayLabel ? colors.muted : colors.ink}>
                {formatLongDate(dayStart(date))}
              </Text>
            </View>
            <Pressable accessibilityLabel="Sonraki gün" onPress={() => goTo(addDays(date, 1))} style={styles.dayButton} hitSlop={6}>
              <Icon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>
          {date !== today ? (
            <Pressable onPress={() => goTo(today)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text size={14} weight="bold" color={colors.primary}>
                Bugüne dön
              </Text>
            </Pressable>
          ) : null}
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
          {!day ? (
            <SkeletonList rows={2} />
          ) : active.length === 0 ? (
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
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropped: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line },
  dayButton: { width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
