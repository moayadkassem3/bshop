import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { PopularStrip } from '@/components/PopularStrip';
import { photoUrl, SalonCard } from '@/components/SalonCard';
import { formatRating, StarIcon } from '@/components/Stars';
import { Card, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useKeyboardRoom } from '@/lib/keyboard';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, themed, themeScheme } from '@/lib/theme';
import { AUDIENCE, type NearbyShop } from '@/lib/types';

type Found = Omit<NearbyShop, 'latitude' | 'longitude' | 'distance_m'> & { distance_m?: number };
type MyShop = Found & { favorite: boolean };

/**
 * The search screen (founder, 12 November 2026; as on the website): opens when Keşfet's
 * search bar is tapped. Before anything is typed it shows Popüler kesimler for the
 * customer's gender, their favourite salons and the salons nearby; while typing, the salons
 * that match (by name, service, district or city), nearest first.
 */
export default function SearchScreen() {
  // Where the map was looking from, and its salon-type filter.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; konum?: string; salon?: string; tur?: string }>();
  const lat = Number(params.lat ?? 40.9905);
  const lng = Number(params.lng ?? 29.029);
  const type = params.tur === 'men' || params.tur === 'women' ? params.tur : null;
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const keyboard = useKeyboardRoom(scroll);
  const [query, setQuery] = useState('');
  const [nearby, setNearby] = useState<NearbyShop[] | null>(null);
  const [favorites, setFavorites] = useState<MyShop[]>([]);
  const [results, setResults] = useState<Found[] | null>(null);
  const text = query.trim();
  const searching = text.length >= 2;

  useEffect(() => {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radiusKm: '30', limit: '8' });
    if (type) q.set('audience', type);
    api<NearbyShop[]>(`/public/nearby?${q}`)
      .then(setNearby)
      .catch(() => setNearby([]));
  }, [lat, lng, type]);

  const loadFavorites = useCallback(() => {
    if (!me) return setFavorites([]);
    api<MyShop[]>('/me/shops')
      .then((shops) => setFavorites(shops.filter((s) => s.favorite)))
      .catch(() => setFavorites([]));
  }, [me]);
  useEffect(loadFavorites, [loadFavorites]);

  // While typing: salons within reach first (they have a distance), then the rest of Türkiye.
  useEffect(() => {
    if (!searching) return setResults(null);
    let stale = false;
    const timer = setTimeout(async () => {
      const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radiusKm: '100', limit: '30', q: text });
      const [near, anywhere] = await Promise.all([
        api<NearbyShop[]>(`/public/nearby?${q}`).catch(() => [] as NearbyShop[]),
        api<Found[]>(`/public/search?q=${encodeURIComponent(text)}`).catch(() => [] as Found[]),
      ]);
      if (stale) return;
      const listed = new Set(near.map((s) => s.slug));
      setResults([...near, ...anywhere.filter((s) => !listed.has(s.slug))]);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searching, text, lat, lng]);

  const audience = me?.gender === 'female' ? 'women' : me?.gender === 'male' ? 'men' : 'all';
  const nearbyTitle = params.salon === '1' ? 'Salonunuzun yakınındaki kuaförler' : params.konum === '1' ? 'Yakınınızdaki kuaförler' : 'Kadıköy çevresindeki kuaförler';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={themeScheme() === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back} accessibilityLabel="Geri" hitSlop={6}>
          <Icon name="back" size={22} color={colors.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.field}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Kuaför ya da hizmet ara"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Kuaför ya da hizmet ara"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} style={styles.clear} accessibilityLabel="Aramayı temizle" hitSlop={6}>
              <Icon name="close" size={16} color={colors.muted} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scroll}
        onScroll={keyboard.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 + insets.bottom + keyboard.room, gap: 12 }}
      >
        {searching ? (
          <>
            <Title text="Sonuçlar" />
            {!results ? <SkeletonList rows={3} /> : null}
            {results && results.length === 0 ? <Note text={`“${text}” ile eşleşen kuaför bulunamadı. Salon adını, hizmeti ya da ilçeyi yazmayı deneyin.`} /> : null}
            {results?.map((s, i) => (
              <Appear key={s.slug} index={i}>
                <SalonCard salon={s} source="kesfet" />
              </Appear>
            ))}
          </>
        ) : (
          <>
            <PopularStrip audience={audience} />
            {favorites.length ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Title text="Favorilerim" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 6 }}
                  style={{ marginHorizontal: -16 }}
                >
                  {favorites.map((s) => (
                    <Card key={s.slug} onPress={() => router.push(`/salon/${s.slug}`)} style={styles.tile}>
                      {s.cover_photo_id ? (
                        <Image source={{ uri: photoUrl(s.cover_photo_id) }} style={styles.tilePhoto} contentFit="cover" transition={150} />
                      ) : (
                        <View style={[styles.tilePhoto, styles.initial]}>
                          <Text size={26} weight="heavy" color={colors.primary}>
                            {s.name[0]}
                          </Text>
                        </View>
                      )}
                      <View style={{ gap: 2, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 11 }}>
                        <Text weight="bold" size={15} numberOfLines={1}>
                          {s.name}
                          {s.verified ? <Text color={colors.primary}> ✓</Text> : null}
                        </Text>
                        {s.rating != null ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <StarIcon size={13} />
                            <Text size={13} weight="bold">
                              {formatRating(s.rating)}
                            </Text>
                            <Text size={13} color={colors.muted}>
                              ({s.rating_count})
                            </Text>
                          </View>
                        ) : (
                          <Text size={13} color={colors.muted} numberOfLines={1}>
                            {[s.district, s.city].filter(Boolean).join(', ') || (AUDIENCE[s.audience] ?? 'Kuaför')}
                          </Text>
                        )}
                      </View>
                    </Card>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={{ gap: 10, marginTop: 8 }}>
              <Title text={nearbyTitle} />
              {!nearby ? <SkeletonList rows={3} /> : null}
              {nearby && nearby.length === 0 ? <Note text="Yakınınızda henüz kuaför yok. Salon adını ya da şehri yazarak arayabilirsiniz." /> : null}
              {nearby?.map((s, i) => (
                <Appear key={s.slug} index={i}>
                  <SalonCard salon={s} source="kesfet" />
                </Appear>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Title({ text }: { text: string }) {
  return (
    <Text size={20} weight="heavy">
      {text}
    </Text>
  );
}

function Note({ text }: { text: string }) {
  return (
    <Text size={15} color={colors.muted} style={{ lineHeight: 22, paddingVertical: 8 }}>
      {text}
    </Text>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg },
    back: { width: 44, height: 52, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
    field: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 16,
      paddingRight: 6,
      minHeight: 52,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    input: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: 10 },
    clear: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    tile: { width: 156, padding: 0, overflow: 'hidden' },
    tilePhoto: { width: 156, height: 100 },
    initial: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  }),
);
