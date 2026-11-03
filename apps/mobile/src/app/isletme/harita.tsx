import { Camera, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { MAP_STYLE, Pin } from '@/components/MapPicker';
import { Appear } from '@/components/motion';
import { Alert, Button, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { formatDistance } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { AUDIENCE, type NearbyShop } from '@/lib/types';

/**
 * Haritada gör (as the website's map from Salonum): your salon on the map as
 * customers see it, with the salons around it. Tap a pin for its name.
 */
export default function SalonMapScreen() {
  const insets = useSafeAreaInsets();
  const { shop, error: shopsError } = useBusinessShops();
  const [nearby, setNearby] = useState<NearbyShop[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = shop?.latitude != null && shop?.longitude != null ? { lat: Number(shop.latitude), lng: Number(shop.longitude) } : null;

  useEffect(() => {
    if (!here) return;
    const params = new URLSearchParams({ lat: String(here.lat), lng: String(here.lng), radiusKm: '5', limit: '60' });
    api<NearbyShop[]>(`/public/nearby?${params}`)
      .then((list) => setNearby(list))
      .catch((err) => setError(errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here?.lat, here?.lng]);

  const others = useMemo(() => nearby.filter((s) => s.slug !== shop?.slug), [nearby, shop?.slug]);
  const picked = selected ? others.find((s) => s.slug === selected) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" />
      {here ? (
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE}
          touchPitch={false}
          logo={false}
          compass={false}
          attributionPosition={{ bottom: 200 + insets.bottom, left: 8 }}
          onPress={() => setSelected(null)}
        >
          <Camera initialViewState={{ center: [here.lng, here.lat], zoom: 14 }} />
          {others.map((s) => (
            <ViewAnnotation key={s.slug} lngLat={[Number(s.longitude), Number(s.latitude)]} anchor="center" onPress={() => setSelected(s.slug)}>
              <View style={[styles.dot, selected === s.slug && styles.dotOn]} />
            </ViewAnnotation>
          ))}
          <ViewAnnotation lngLat={[here.lng, here.lat]} anchor="bottom" onPress={() => setSelected(null)}>
            <Pin size={46} />
          </ViewAnnotation>
        </Map>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/salonum'))} style={styles.round} accessibilityLabel="Salonum" hitSlop={8}>
          <Icon name="back" size={22} color={colors.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.title}>
          <Text weight="heavy">Haritada gör</Text>
          <Text size={13} color={colors.muted}>
            {others.length ? `Çevrenizde ${others.length} salon (5 km)` : 'Salonunuz müşterilere bu konumda görünür'}
          </Text>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
        {shop && !here ? <Alert tone="info" text="Salonunuzun konumu kayıtlı değil. Salon bilgileri’nden haritada işaretleyin." /> : null}
        {picked ? (
          <Appear key={picked.slug} style={{ gap: 4 }}>
            <Text size={18} weight="heavy">
              {picked.name}
            </Text>
            <Text color={colors.muted}>
              {[AUDIENCE[picked.audience], picked.district, picked.distance_m != null ? `Salonunuza ${formatDistance(picked.distance_m)}` : null].filter(Boolean).join(' · ')}
            </Text>
            <Button kind="secondary" title="Salon sayfasını aç" onPress={() => router.push(`/salon/${picked.slug}`)} style={{ marginTop: 8 }} />
          </Appear>
        ) : shop ? (
          <Appear key="mine" style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.legend} />
              <Text size={18} weight="heavy" style={{ flex: 1 }} numberOfLines={1}>
                {shop.name}
              </Text>
            </View>
            <Text color={colors.muted}>Mavi iğne salonunuz; koyu noktalar çevredeki salonlar. Bir noktaya dokunun.</Text>
            <Button kind="secondary" title="Müşteri gözüyle gör" onPress={() => router.push(`/salon/${shop.slug}`)} style={{ marginTop: 8 }} />
          </Appear>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surface },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.ink, borderWidth: 3, borderColor: colors.white },
  dotOn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary },
  legend: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
});
