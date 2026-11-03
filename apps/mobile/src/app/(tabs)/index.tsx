import * as Location from 'expo-location';
import { Redirect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { SalonCard } from '@/components/SalonCard';
import { Alert, Chip, Empty, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/lib/theme';
import type { NearbyShop } from '@/lib/types';

type Audience = 'all' | 'men' | 'women';
// Before the customer shares their location, Keşfet opens on Kadıköy (as on the website).
const KADIKOY = { latitude: 40.9903, longitude: 29.029 };

/** Keşfet (customers): salons nearest first, with search and salon-type filters. The map comes in a later phase. */
export default function ExploreScreen() {
  const { me, business } = useSession();
  const [point, setPoint] = useState(KADIKOY);
  const [located, setLocated] = useState(false);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<Audience>(me?.gender === 'female' ? 'women' : me?.gender === 'male' ? 'men' : 'all');
  const [shops, setShops] = useState<NearbyShop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const locate = useCallback(async (ask: boolean) => {
    setLocating(true);
    try {
      const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setLocated(true);
    } catch {
      // Location off or unavailable: stay on the default area.
    } finally {
      setLocating(false);
    }
  }, []);

  // Use the location if already allowed; asking is left to "Konumumu kullan".
  useEffect(() => {
    locate(false);
  }, [locate]);

  const load = useCallback(async () => {
    const id = ++request.current;
    const params = new URLSearchParams({ lat: String(point.latitude), lng: String(point.longitude), radiusKm: '30', limit: '60' });
    if (query.trim()) params.set('q', query.trim());
    if (audience !== 'all') params.set('audience', audience);
    try {
      const list = await api<NearbyShop[]>(`/public/nearby?${params}`);
      if (id === request.current) {
        setShops(list);
        setError(null);
      }
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    }
  }, [point, query, audience]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  if (business) return <Redirect href="/salonum" />;
  return (
    <Screen
      title="Keşfet"
      subtitle={located ? 'Yakınınızdaki kuaförler' : 'Kadıköy, İstanbul çevresi'}
      header={
        <View style={styles.search}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Kuaför ya da hizmet ara" placeholderTextColor={colors.muted} style={styles.searchInput} returnKeyType="search" />
        </View>
      }
      onRefresh={load}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Tümü" on={audience === 'all'} onPress={() => setAudience('all')} />
        <Chip label="Erkek kuaförü" on={audience === 'men'} onPress={() => setAudience('men')} />
        <Chip label="Kadın kuaförü" on={audience === 'women'} onPress={() => setAudience('women')} />
      </ScrollView>
      {!located ? (
        <Pressable onPress={() => void locate(true)} style={styles.locate} disabled={locating}>
          <Icon name="locate" size={20} color={colors.primary} />
          <Text weight="bold" color={colors.primary}>
            {locating ? 'Konum alınıyor…' : 'Konumumu kullan'}
          </Text>
        </Pressable>
      ) : null}
      {error ? <Alert text={error} /> : null}
      {!shops && !error ? <SkeletonList rows={4} /> : null}
      {shops && shops.length === 0 ? (
        <Appear>
          <Empty title="Kuaför bulunamadı" text="Bu bölgede aramanızla eşleşen kuaför yok." />
        </Appear>
      ) : null}
      {shops?.map((s, i) => (
        <Appear key={`${audience}-${s.slug}`} index={i}>
          <SalonCard salon={s} />
        </Appear>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 14, minHeight: 50, borderRadius: radius.sm, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  locate: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6 },
});
