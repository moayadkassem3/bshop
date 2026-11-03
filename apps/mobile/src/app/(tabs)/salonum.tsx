import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Button, Card, Empty, Loading, Screen, Text } from '@/components/ui';
import { api, errorMessage, WEB_URL } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { formatTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import type { ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';

/** Salonum (business home, as on the website): today at a glance. */
export default function SalonumScreen() {
  const { me } = useSession();
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [items, setItems] = useState<ShopAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shop) return;
    const now = new Date();
    const end = new Date(now.getTime() + 365 * 86_400_000);
    try {
      setItems(await api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${new Date(now.getTime() - 12 * 3_600_000).toISOString()}&to=${end.toISOString()}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);
  const { refreshing, refresh } = usePolling(load);

  if (!me) return <SignInFirst />;
  const now = Date.now();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const isToday = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(iso)) === today;
  const waiting = items?.filter((a) => a.status === 'pending') ?? [];
  const todays = items?.filter((a) => a.status === 'confirmed' && isToday(a.starts_at)) ?? [];
  const next = todays.filter((a) => new Date(a.ends_at).getTime() > now).slice(0, 4);

  return (
    <Screen title="Salonum" header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />} onRefresh={refresh} refreshing={refreshing}>
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shops && shops.length === 0 ? <Empty title="Bu hesap henüz bir işletmeye bağlı değil." /> : null}
      {shop && !items && !error ? <Loading /> : null}
      {shop && items ? (
        <>
          <Text size={20} weight="heavy">
            Bugün
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile value={waiting.length} label="Bekleyen talep" alert={waiting.length > 0} onPress={() => router.push('/randevular')} />
            <Tile value={todays.length} label="Bugünkü randevu" onPress={() => router.push('/randevular?tab=takvim')} />
          </View>
          <Card style={{ gap: 10 }}>
            <Text weight="bold">Sıradaki randevular</Text>
            {next.length === 0 ? (
              <Text color={colors.muted}>Bugün başka randevu yok.</Text>
            ) : (
              next.map((a) => (
                <View key={a.id} style={styles.nextRow}>
                  <Text weight="bold" style={{ width: 56 }}>
                    {formatTime(a.starts_at)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold" numberOfLines={1}>
                      {a.guest_name ?? a.customer_name}
                    </Text>
                    <Text size={13} color={colors.muted} numberOfLines={1}>
                      {(a.services ?? []).map((s) => s.name).join(' + ')}
                      {shop.role === 'owner' ? ` · ${a.staff_name}` : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
          <Text size={20} weight="heavy" style={{ marginTop: 8 }}>
            Salonunuz
          </Text>
          <Button kind="secondary" title="Müşteri gözüyle gör" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/${shop.slug}`).catch(() => undefined)} />
        </>
      ) : null}
    </Screen>
  );
}

function Tile(props: { value: number; label: string; alert?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.tile, props.alert && styles.tileAlert, pressed && { opacity: 0.85 }]}>
      <Text size={36} weight="heavy" color={props.alert ? colors.warning : colors.ink}>
        {props.value}
      </Text>
      <Text size={14} weight="semibold" color={colors.ink2}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SignInFirst() {
  return (
    <Screen title="Giriş yapın">
      <Empty title="Devam etmek için giriş yapın" text="Telefon numaranızla Profil’den giriş yapabilirsiniz.">
        <Button title="Giriş yap" onPress={() => router.push('/profil')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </Empty>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tileAlert: { borderColor: '#f6d28a', backgroundColor: colors.warningSoft },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
