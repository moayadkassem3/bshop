import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { addDays, dayStart, formatLongDate, turkeyDate } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { Icon } from './Icon';
import { ShopAppointmentCard } from './ShopAppointmentCard';
import { ShopPicker } from './ShopPicker';
import { Alert, Empty, Loading, Screen, Segmented, Text } from './ui';

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

  useEffect(() => {
    if (params.tab === 'takvim') setTab('takvim');
  }, [params.tab]);

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      const now = new Date();
      const [open, list] = await Promise.all([
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${now.toISOString()}&to=${new Date(now.getTime() + 365 * 86_400_000).toISOString()}`),
        api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${dayStart(date).toISOString()}&to=${dayStart(addDays(date, 1)).toISOString()}`),
      ]);
      setRequests(open.filter((a) => a.status === 'pending' || a.status === 'offered'));
      setDay(list.filter((a) => a.status !== 'declined'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop, date]);
  const { refreshing, refresh } = usePolling(load);

  const pending = requests?.filter((a) => a.status === 'pending').length ?? 0;
  const owner = shop?.role === 'owner';
  const today = turkeyDate(new Date());
  const dayLabel = date === today ? 'Bugün' : date === addDays(today, 1) ? 'Yarın' : date === addDays(today, -1) ? 'Dün' : '';

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
          <Loading />
        ) : requests.length === 0 ? (
          <Empty title="Bekleyen talep yok" text="Yeni randevu talepleri burada görünür. Sayfa kendiliğinden yenilenir." />
        ) : (
          requests.map((a) => <ShopAppointmentCard key={a.id} shopId={shop.id} appointment={a} showDate showStaff={owner} onChanged={load} />)
        )
      ) : null}
      {shop && tab === 'takvim' ? (
        <>
          <View style={styles.dayBar}>
            <Pressable accessibilityLabel="Önceki gün" onPress={() => setDate(addDays(date, -1))} style={styles.dayButton} hitSlop={6}>
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
            <Pressable accessibilityLabel="Sonraki gün" onPress={() => setDate(addDays(date, 1))} style={styles.dayButton} hitSlop={6}>
              <Icon name="chevron" size={20} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>
          {!day ? (
            <Loading />
          ) : day.length === 0 ? (
            <Empty title="Randevu yok" text="Bu gün için randevu bulunmuyor." />
          ) : (
            day.map((a) => <ShopAppointmentCard key={a.id} shopId={shop.id} appointment={a} showStaff={owner} onChanged={load} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayButton: { width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
