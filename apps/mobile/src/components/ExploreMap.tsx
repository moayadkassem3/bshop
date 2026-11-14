import { useMenOnly } from '@/lib/session';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { api, WEB_URL } from '@/lib/api';
import { formatDistance } from '@/lib/format';
import { colors, radius, themed, themeScheme } from '@/lib/theme';
import { AUDIENCE, type BusinessShop, type NearbyShop } from '@/lib/types';
import { Icon } from './Icon';
import { LogoMark } from './LogoMark';
import { MapCredit, mapStyle } from './MapPicker';
import { Appear, SkeletonList } from './motion';
import { photoUrl } from './SalonCard';
import { formatRating, StarIcon } from './Stars';
import { Alert, Button, Text } from './ui';

type Audience = 'all' | 'men' | 'women';
type LatLng = { lat: number; lng: number };

/** Before the customer shares their location, the map opens on Kadıköy, İstanbul (as on the website). */
const KADIKOY: LatLng = { lat: 40.9905, lng: 29.029 };
const LOCATION_KEY = 'last-location';
const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

function distanceMeters(a: LatLng, b: LatLng): number {
  const r = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const placeLabel = (s: { district?: string | null; city?: string | null }) => [s.district, s.city].filter(Boolean).join(', ');

/**
 * Keşfet (as the website's ExploreMap): the map of bookable salons with the
 * search and salon-type filters floating on top, and the list in a sheet you
 * drag up and down. In business mode (Haritada gör) the map stays on the salon,
 * the sheet opens with the salon's own card, and nearby salons are measured
 * from it.
 */
export function ExploreMap(props: { initialAudience?: Audience; home?: BusinessShop | null; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const list = useRef<ScrollView>(null);
  const homeShop = props.home && props.home.latitude != null && props.home.longitude != null ? props.home : null;
  const home: LatLng | null = homeShop ? { lat: Number(homeShop.latitude), lng: Number(homeShop.longitude) } : null;

  const [start, setStart] = useState<LatLng | null>(home);
  const [center, setCenter] = useState<LatLng>(home ?? KADIKOY);
  const [user, setUser] = useState<LatLng | null>(home);
  const menOnly = useMenOnly();
  const [chosenType, setAudience] = useState<Audience>(props.initialAudience ?? 'all');
  const audience: Audience = menOnly && chosenType === 'women' ? 'men' : chosenType;
  const [shops, setShops] = useState<NearbyShop[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Where the map opens: the salon, else where the customer was last time, else Kadıköy.
  useEffect(() => {
    if (home) return;
    (async () => {
      const saved = await SecureStore.getItemAsync(LOCATION_KEY).catch(() => null);
      const last = saved ? (JSON.parse(saved) as LatLng) : null;
      setStart(last ?? KADIKOY);
      if (last) {
        setCenter(last);
        setUser(last);
        lastHere.current = last;
      }
      // Refresh it quietly when already allowed; asking is left to "Konumumu kullan".
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (perm?.granted) void locate(true, last);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The last position found, for the locate button to fly to at once every time it is pressed.
  const lastHere = useRef<LatLng | null>(null);
  const flyHere = (here: LatLng) => {
    camera.current?.flyTo({ center: [here.lng, here.lat], zoom: 15, duration: 900 });
    setCenter(here);
  };

  const locate = useCallback(async (quiet = false, before: LatLng | null = null) => {
    if (!quiet) setLocating(true);
    setLocationError(null);
    try {
      const perm = quiet ? await Location.getForegroundPermissionsAsync() : await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('denied');
      // Pressing the button moves the map straight away (the second press used to wait for a
      // new GPS fix that Android sometimes never delivers); a fresh fix follows if it comes.
      const known = lastHere.current;
      if (!quiet && known) flyHere(known);
      const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8000).catch(() => Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }));
      if (!pos) throw new Error('no position');
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      lastHere.current = here;
      setUser(here);
      SecureStore.setItemAsync(LOCATION_KEY, JSON.stringify(here)).catch(() => undefined);
      // A quiet refresh only moves the map when the customer is somewhere new; a press moves it
      // again only when the fresh position differs from where it already flew.
      if (quiet ? !before || distanceMeters(before, here) > 300 : !known || distanceMeters(known, here) > 30) flyHere(here);
    } catch {
      if (!quiet) setLocationError('Konumunuza erişilemedi. Telefon ayarlarından konum iznini açabilirsiniz.');
    } finally {
      setLocating(false);
    }
  }, []);

  // Salons around the map's centre, filtered by salon type.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), radiusKm: '30' });
      if (audience !== 'all') params.set('audience', audience);
      api<NearbyShop[]>(`/public/nearby?${params}`)
        .then((l) => !cancelled && setShops(l))
        .catch(() => !cancelled && setShops([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [center, audience]);

  // Nearest first: from the customer (or the salon) when known, else from the map's centre.
  const sorted = useMemo(() => {
    if (!shops) return null;
    const all = user
      ? shops.map((s) => ({ ...s, distance_m: Math.round(distanceMeters(user, { lat: Number(s.latitude), lng: Number(s.longitude) })) })).sort((a, b) => a.distance_m - b.distance_m)
      : shops;
    // In business mode the salon's own card is shown above, so the list holds the others.
    return homeShop ? all.filter((s) => s.slug !== homeShop.slug) : all;
  }, [shops, user, homeShop]);

  // ---- The sheet: follows the finger, then settles open or closed (a flick decides by direction).
  const [area, setArea] = useState(0);
  const [topHeight, setTopHeight] = useState(150);
  const [open, setOpen] = useState(false);
  const closedH = Math.round(area * 0.36);
  const openH = Math.max(closedH, area - topHeight - 8);
  const sheetH = useSharedValue(0);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (!area) return;
    sheetH.value = sheetH.value === 0 ? (open ? openH : closedH) : withSpring(open ? openH : closedH, SPRING);
  }, [area, open, openH, closedH, sheetH]);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      dragStart.value = sheetH.value;
    })
    .onUpdate((e) => {
      sheetH.value = Math.min(openH, Math.max(area * 0.14, dragStart.value - e.translationY));
    })
    .onEnd((e) => {
      const next = Math.abs(e.velocityY) > 400 ? e.velocityY < 0 : sheetH.value > (closedH + openH) / 2;
      sheetH.value = withSpring(next ? openH : closedH, { ...SPRING, velocity: -e.velocityY });
      runOnJS(setOpen)(next);
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: sheetH.value }));
  const locateStyle = useAnimatedStyle(() => ({ bottom: sheetH.value + 12, opacity: sheetH.value > (closedH + openH) / 2 ? 0 : 1 }));

  // Tapping a pin shows that salon's card at the top of the sheet and highlights it in the list.
  // The map's own tap (which clears the choice) is ignored right after a pin tap.
  const pinTap = useRef(0);
  const select = (slug: string) => {
    pinTap.current = Date.now();
    Haptics.selectionAsync().catch(() => undefined);
    setSelected(slug);
    list.current?.scrollTo({ y: 0, animated: true });
  };
  const picked = selected ? (sorted ?? []).find((s) => s.slug === selected) : null;

  const goHome = () => home && camera.current?.flyTo({ center: [home.lng, home.lat], zoom: 15, duration: 800 });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout.height)}>
      <StatusBar style={themeScheme() === 'dark' ? 'light' : 'dark'} />
      {start ? (
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle()}
          touchPitch={false}
          compass={false}
          logo={false}
          attribution={false}
          contentInset={{ top: topHeight, bottom: closedH }}
          onPress={() => {
            if (Date.now() - pinTap.current > 400) setSelected(null);
          }}
          onRegionDidChange={(e) => {
            const [lng, lat] = e.nativeEvent.center;
            setCenter({ lat, lng });
          }}
        >
          <Camera ref={camera} initialViewState={{ center: [start.lng, start.lat], zoom: home || start !== KADIKOY ? 15 : 14 }} />
          {user && !home ? (
            <Marker lngLat={[user.lng, user.lat]} anchor="center">
              <View style={styles.userHalo} pointerEvents="none">
                <View style={styles.userDot} />
              </View>
            </Marker>
          ) : null}
          {/* Markers (live native views) rather than ViewAnnotations, which Android draws as pictures that do not take taps or redraw. */}
          {(sorted ?? []).map((s) => (
            <Marker key={s.slug} lngLat={[Number(s.longitude), Number(s.latitude)]} anchor="bottom" onPress={() => select(s.slug)}>
              <Pressable onPress={() => (selected === s.slug ? router.push(`/salon/${s.slug}?kaynak=kesfet`) : select(s.slug))} hitSlop={8} accessibilityLabel={s.name}>
                <PinView label={selected === s.slug ? { name: s.name, rating: s.rating ?? null, distance: formatDistance(s.distance_m) } : null} selected={selected === s.slug} />
              </Pressable>
            </Marker>
          ))}
          {homeShop && home ? (
            <Marker lngLat={[home.lng, home.lat]} anchor="bottom">
              <View pointerEvents="none">
                <PinView mine label={null} selected={false} />
              </View>
            </Marker>
          ) : null}
        </Map>
      ) : null}

      {/* Search, filters and the location pill float on the map. */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }]} onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {props.onBack ? (
            <Pressable onPress={props.onBack} style={styles.back} accessibilityLabel="Geri" hitSlop={6}>
              <Icon name="back" size={22} color={colors.ink} strokeWidth={2.4} />
            </Pressable>
          ) : null}
          {/* The bar opens the search screen (founder, 12 November 2026), measured from where the map is. */}
          <Pressable
            onPress={() => {
              const from = user ?? center;
              router.push({ pathname: '/ara', params: { lat: String(from.lat), lng: String(from.lng), konum: user ? '1' : '0', salon: home ? '1' : '0', tur: audience } });
            }}
            style={[styles.search, { flex: 1 }]}
            accessibilityRole="search"
            accessibilityLabel="Kuaför ya da hizmet ara"
          >
            <View style={{ flexShrink: 0 }}>
              <Icon name="search" size={20} color={colors.muted} />
            </View>
            <Text size={16} color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
              Kuaför ya da hizmet ara
            </Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {(
            [
              ['all', 'Tümü'],
              ['men', 'Erkek kuaförü'],
              ['women', 'Kadın kuaförü'],
            ] as const
          ).map(([value, label]) => {
            const on = audience === value;
            // Men customers cannot pick women's salons (founder, 14 November 2026): greyed out.
            const off = menOnly && value === 'women';
            return (
              <Pressable
                key={value}
                onPress={() => setAudience(value)}
                disabled={off}
                style={[styles.chip, on && styles.chipOn, off && { opacity: 0.4 }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: off }}
              >
                <Text size={14} weight="bold" color={on ? colors.white : colors.ink}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* One location prompt for customers (review, 12 November 2026): the banner in the list
            until they share it, and the round button; the pill is only the salon's "Salonum". */}
        {home ? (
          <Pressable onPress={goHome} style={styles.pill}>
            <LogoMark size={15} color={colors.primary} />
            <Text size={14} weight="bold" color={colors.primary}>
              Salonum
            </Text>
          </Pressable>
        ) : null}
      </View>

      {start ? <MapCredit style={{ bottom: closedH + 6, left: 12 }} /> : null}
      <Animated.View style={[styles.locate, locateStyle]}>
        <Pressable onPress={() => (home ? goHome() : void locate())} accessibilityLabel={home ? 'Salonuma git' : 'Konumuma git'} style={styles.locateInner} hitSlop={6}>
          <Icon name="locate" size={22} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={styles.grab}>
            <Pressable onPress={() => setOpen(!open)} style={styles.handle} accessibilityLabel={open ? 'Listeyi küçült' : 'Listeyi büyüt'} accessibilityState={{ expanded: open }} hitSlop={8}>
              <Svg width={48} height={16} viewBox="0 0 48 16" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                <Path d="M5 12 24 4l19 8" fill="none" stroke="#c9cfd8" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            {homeShop ? <MyShopCard shop={homeShop} /> : null}
            <Text size={homeShop ? 17 : 22} weight="heavy" style={{ letterSpacing: -0.3 }}>
              {homeShop ? 'Çevredeki salonlar' : 'Yakındaki kuaförler'}
            </Text>
            <Text size={14} color={colors.muted}>
              {sorted ? (
                <>
                  {homeShop ? 'Salonunuzun çevresinde' : user ? 'Yakınınızda' : 'Bu bölgede'}{' '}
                  <Text size={14} weight="bold" color={colors.ink}>
                    {sorted.length} kuaför
                  </Text>{' '}
                  · en yakından uzağa
                </>
              ) : (
                'Kuaförler yükleniyor…'
              )}
            </Text>
          </View>
        </GestureDetector>
        <ScrollView ref={list} contentContainerStyle={{ paddingBottom: 24, gap: 4 }} keyboardShouldPersistTaps="handled">
          {picked ? (
            <Appear key={picked.slug}>
              <Pressable onPress={() => router.push(`/salon/${picked.slug}?kaynak=kesfet`)} style={({ pressed }) => [styles.pickedCard, pressed && { transform: [{ scale: 0.985 }] }]}>
                <Thumb photo={picked.cover_photo_id} name={picked.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text weight="bold" size={16} numberOfLines={1}>
                    {picked.name}
                    {picked.verified ? <Text color={colors.primary}> ✓</Text> : null}
                  </Text>
                  <Text size={13} color={colors.muted} numberOfLines={1}>
                    {picked.rating != null ? `★ ${picked.rating.toLocaleString('tr-TR', { minimumFractionDigits: 1 })} · ` : ''}
                    {AUDIENCE[picked.audience] ?? 'Kuaför'} · {formatDistance(picked.distance_m)}
                  </Text>
                  <Text size={14} weight="bold" color={colors.primary}>
                    Salonu gör ve randevu al ›
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Kapat" style={styles.close}>
                  <Text size={18} color={colors.muted}>
                    ×
                  </Text>
                </Pressable>
              </Pressable>
            </Appear>
          ) : null}
          {!user && !home ? (
            <View style={styles.hint}>
              <Text size={14} color={colors.ink2} style={{ flex: 1 }}>
                Size en yakın kuaförleri görmek için konumunuzu paylaşın.
              </Text>
              <Button small title="Konumumu kullan" onPress={() => void locate()} disabled={locating} />
            </View>
          ) : null}
          {locationError ? <Alert text={locationError} /> : null}
          {!sorted ? <SkeletonList rows={3} /> : null}
          {(sorted ?? []).map((s, i) => (
            <View key={s.slug}>
              <Appear index={i}>
                <Pressable
                  onPress={() => router.push(`/salon/${s.slug}?kaynak=kesfet`)}
                  onPressIn={() => setSelected(s.slug)}
                  style={({ pressed }) => [styles.item, s.slug === selected && styles.itemSelected, pressed && { transform: [{ scale: 0.985 }] }]}
                >
                  <Thumb photo={s.cover_photo_id} name={s.name} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="bold" size={16} numberOfLines={1}>
                      {s.name}
                      {s.verified ? <Text color={colors.primary}> ✓</Text> : null}
                    </Text>
                    <Text size={13} color={colors.muted} numberOfLines={1}>
                      {s.rating != null ? `★ ${s.rating.toLocaleString('tr-TR', { minimumFractionDigits: 1 })} (${s.rating_count}) · ` : ''}
                      {AUDIENCE[s.audience] ?? 'Kuaför'}
                      {placeLabel(s) ? ` · ${placeLabel(s)}` : ''}
                    </Text>
                  </View>
                  <Text size={13} weight="semibold" color={colors.ink2}>
                    {formatDistance(s.distance_m)}
                  </Text>
                </Pressable>
              </Appear>
            </View>
          ))}
          {sorted && sorted.length === 0 ? (
            <Text color={colors.muted} style={{ padding: 12 }}>
              Bu bölgede kuaför bulunamadı. Haritayı kaydırmayı deneyin.
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** "Salonum" at the top of the sheet in business mode: the salon as customers see it, one tap away. */
function MyShopCard({ shop }: { shop: BusinessShop }) {
  const link = `${WEB_URL}/${shop.slug}`;
  return (
    <View style={styles.myShop}>
      <Text size={12} weight="bold" color={colors.primary} style={{ letterSpacing: 0.8 }}>
        SALONUM
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Thumb photo={null} name={shop.name} />
        <View style={{ flex: 1 }}>
          <Text weight="bold" size={16} numberOfLines={1}>
            {shop.name}
          </Text>
          <Text size={13} color={colors.muted} numberOfLines={1}>
            {shop.audience ? AUDIENCE[shop.audience] : 'Kuaför'}
            {placeLabel(shop) ? ` · ${placeLabel(shop)}` : ''}
          </Text>
        </View>
      </View>
      {shop.visible ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small title="Müşteri gözüyle gör" onPress={() => router.push(`/salon/${shop.slug}`)} style={{ flex: 1 }} />
          <Button small kind="secondary" title="Paylaş" onPress={() => Share.share({ message: `${shop.name}: randevu almak için ${link}`, url: link }).catch(() => undefined)} />
        </View>
      ) : (
        <Text size={13} color={colors.muted}>
          Salonunuz şu anda müşterilere görünmüyor.
        </Text>
      )}
    </View>
  );
}

function Thumb({ photo, name }: { photo: string | null; name: string }) {
  return photo ? (
    <Image source={{ uri: photoUrl(photo) }} style={styles.thumb} contentFit="cover" transition={150} />
  ) : (
    <View style={[styles.thumb, styles.initial]}>
      <Text size={22} weight="heavy" color={colors.primary}>
        {name[0]}
      </Text>
    </View>
  );
}

type PinLabel = { name: string; rating: number | null; distance: string };

/**
 * A salon on the map: the app's scissors in a round pin; the chosen one turns blue with its
 * name above and, below the name, its rating with a star (founder, 8 November 2026) and distance.
 */
function PinView({ selected, mine, label }: { selected: boolean; mine?: boolean; label: PinLabel | null }) {
  const bg = selected ? colors.primary : mine ? colors.night : colors.surface;
  const fg = selected || mine ? colors.white : colors.primary;
  return (
    <View style={{ alignItems: 'center' }}>
      {label ? (
        <View style={styles.label}>
          <Text size={13} weight="bold" color={colors.white} numberOfLines={1}>
            {label.name}
          </Text>
          <View style={styles.labelLine}>
            {label.rating != null ? (
              <>
                <Text size={12} weight="bold" color={colors.white}>
                  {formatRating(label.rating)}
                </Text>
                <StarIcon size={12} />
                <Text size={12} color={colors.darkMuted}>
                  ·
                </Text>
              </>
            ) : null}
            <Text size={12} color={colors.darkMuted}>
              {label.distance}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.pin, { backgroundColor: bg, borderColor: mine && !selected ? colors.ink : colors.primary }]}>
        <LogoMark size={22} color={fg} />
      </View>
    </View>
  );
}

const shadow = { shadowColor: '#0b1120', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 };

const styles = themed(() =>
  StyleSheet.create({
    top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 10, paddingHorizontal: 16 },
    back: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, borderRadius: radius.sm, backgroundColor: colors.surface, ...shadow },
    chip: { paddingHorizontal: 16, minHeight: 38, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow },
    chipOn: { backgroundColor: colors.night },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow },
    locate: { position: 'absolute', right: 16 },
    locateInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: colors.surface,
      shadowColor: '#0b1120',
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: -8 },
      elevation: 12,
    },
    grab: { paddingBottom: 10, gap: 2 },
    handle: { alignSelf: 'center', paddingHorizontal: 40, paddingTop: 10, paddingBottom: 6 },
    hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: 6 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
    itemSelected: { backgroundColor: colors.primarySoft },
    thumb: { width: 56, height: 56, borderRadius: radius.sm },
    initial: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    pickedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginBottom: 8,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface2,
    },
    close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
    myShop: { gap: 10, padding: 12, marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
    pin: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, alignItems: 'center', justifyContent: 'center', ...shadow },
    label: { alignItems: 'center', gap: 2, marginBottom: 6, maxWidth: 240, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.night, ...shadow },
    labelLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    userHalo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(31,72,201,0.2)', alignItems: 'center', justifyContent: 'center' },
    userDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.white },
  }),
);

/** Rejects when the promise has not settled within ms. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
