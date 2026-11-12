import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Appear, PageSkeleton } from '@/components/motion';
import { HaircutCard } from '@/components/HaircutCard';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { PhotoTile } from '@/components/PhotoTile';
import { photoUrl } from '@/components/SalonCard';
import { StaffAvatar } from '@/components/StaffAvatar';
import { formatRating, StarRow } from '@/components/Stars';
import { Alert, Button, Card, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatPrice } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { useLikes } from '@/lib/likes';
import { useSession } from '@/lib/session';
import { colors, radius, themed } from '@/lib/theme';
import { AUDIENCE, type RatingsSummary, type ShopProfile } from '@/lib/types';

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const width = Dimensions.get('window').width;

/** Weekday in Türkiye, 1 = Monday … 7 = Sunday. */
function turkeyWeekday(): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

const counted = new Set<string>();

/** A salon's page (as on the website): photos, details, services, staff and hours. */
export default function SalonScreen() {
  const { slug, kaynak } = useLocalSearchParams<{ slug: string; kaynak?: string }>();
  const { me, business } = useSession();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [ratings, setRatings] = useState<RatingsSummary | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const { liked, toggle: toggleLike } = useLikes();

  const load = useCallback(async () => {
    try {
      setProfile(await api<ShopProfile>(`/public/shops/${slug}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [slug]);

  // A visit for the salon's statistics (as the website's ViewTracker): once per app session,
  // and not when the salon's own people look at it in business mode.
  useEffect(() => {
    if (!slug || business || counted.has(slug)) return;
    counted.add(slug);
    api(`/public/shops/${encodeURIComponent(slug)}/views`, { method: 'POST', body: { source: kaynak === 'kesfet' ? 'kesfet' : 'diger' } }).catch(() => undefined);
  }, [slug, kaynak, business]);

  useEffect(() => {
    load();
    api<RatingsSummary>(`/public/shops/${slug}/ratings`)
      .then(setRatings)
      .catch(() => setRatings(null));
    if (me) {
      api<{ slug: string; favorite: boolean }[]>('/me/shops')
        .then((list) => setFavorite(Boolean(list.find((s) => s.slug === slug)?.favorite)))
        .catch(() => setFavorite(false));
    }
  }, [load, me, slug]);

  async function toggleFavorite() {
    if (!me) return router.push('/profil');
    const next = !favorite;
    setFavorite(next);
    try {
      await api(`/me/favorites/${slug}`, { method: next ? 'PUT' : 'DELETE' });
    } catch {
      setFavorite(!next);
    }
  }

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 16, gap: 12, backgroundColor: colors.bg }}>
        <Alert text={error} />
        <Button kind="secondary" title="Geri dön" onPress={() => router.back()} />
      </View>
    );
  }
  if (!profile) return <PageSkeleton photo />;

  const weekday = turkeyWeekday();
  const today = profile.openingHours.find((h) => h.weekday === weekday);
  const place = [profile.district, profile.city].filter(Boolean).join(', ');
  const directions =
    profile.latitude != null && profile.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${profile.latitude},${profile.longitude}`
      : profile.address
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.address)}`
        : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        {profile.photos.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {profile.photos.map((p, i) => (
              <Pressable key={p.id} onPress={() => setViewer(i)} accessibilityLabel={`Fotoğraf ${i + 1}`}>
                <Image source={{ uri: photoUrl(p.id) }} style={{ width, height: width * 0.75 }} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: insets.top + 56, backgroundColor: colors.night }} />
        )}
        <Pressable onPress={() => router.back()} style={[styles.floatingBack, { top: insets.top + 10 }]} hitSlop={8} accessibilityLabel="Geri">
          <Icon name="back" size={22} color={colors.ink} strokeWidth={2.4} />
        </Pressable>

        <View style={{ padding: 16, gap: 12 }}>
          <Appear>
            <View style={{ gap: 4 }}>
              <Text size={13} weight="semibold" color={colors.primary}>
                {AUDIENCE[profile.audience]}
                {place ? ` · ${place}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text size={28} weight="heavy" style={{ flex: 1, letterSpacing: -0.5 }}>
                  {profile.name}
                  {profile.verified ? (
                    <Text size={24} color={colors.primary}>
                      {' '}
                      ✓
                    </Text>
                  ) : null}
                </Text>
                <Pressable onPress={toggleFavorite} accessibilityLabel={favorite ? 'Favorilerimde' : 'Favorilere ekle'} style={[styles.heart, favorite && styles.heartOn]} hitSlop={6}>
                  <Icon name="favoriler" size={22} color={favorite ? colors.heart : colors.ink} />
                </Pressable>
              </View>
              {profile.verified ? (
                <Text size={13} color={colors.muted}>
                  Doğrulanmış salon · uygulama üzerinden en az 3 randevu tamamladı
                </Text>
              ) : null}
              {profile.rating != null ? (
                <Text size={15} color={colors.ink2}>
                  <Text color={colors.star}>★</Text> <Text weight="bold">{profile.rating.toLocaleString('tr-TR', { minimumFractionDigits: 1 })}</Text> ({profile.ratingCount} değerlendirme)
                </Text>
              ) : null}
              <View style={[styles.today, { backgroundColor: today?.open ? colors.primarySoft : colors.surface2 }]}>
                <Text size={14} weight="semibold" color={today?.open ? colors.primary : colors.muted}>
                  {today?.open ? `Bugün açık · ${today.open}–${today.close}` : 'Bugün kapalı'}
                </Text>
              </View>
              {profile.about ? <Text color={colors.ink2}>{profile.about}</Text> : null}
            </View>
          </Appear>

          {/* The website's order: details, photos, work, hours, services, staff, ratings. */}
          <Appear index={1}>
            <Card style={{ gap: 4 }}>
              <SectionTitle>Salon bilgileri</SectionTitle>
              {profile.address ? <InfoRow icon="pin" text={profile.address} action={directions ? { label: 'Yol tarifi', onPress: () => Linking.openURL(directions) } : undefined} /> : null}
              {profile.phone ? <InfoRow icon="phone" text={formatPhone(profile.phone)} hint="Ara" onPress={() => Linking.openURL(`tel:${profile.phone}`)} /> : null}
              {profile.whatsapp ? <InfoRow icon="whatsapp" text="WhatsApp ile yazın" hint="Aç" onPress={() => Linking.openURL(whatsappUrl(profile.whatsapp!))} /> : null}
              {profile.instagram ? <InfoRow icon="instagram" text={`@${profile.instagram}`} hint="Instagram" onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram}`)} /> : null}
            </Card>
          </Appear>

          {/* Services and prices right after the salon info: what most people look for first (review, 12 November 2026). */}
          <Appear index={2}>
            <Card style={{ gap: 0 }}>
              <SectionTitle>Hizmetler ve fiyatlar</SectionTitle>
              {profile.services.map((s, i) => (
                <View key={s.id} style={[styles.serviceRow, i < profile.services.length - 1 && styles.line]}>
                  <View style={{ flex: 1 }}>
                    <Text size={16} weight="semibold">
                      {s.name}
                    </Text>
                    <Text size={14} color={colors.muted}>
                      {formatDuration(s.duration_minutes)}
                    </Text>
                  </View>
                  <Text size={16} weight="heavy">
                    {formatPrice(s.price_kurus, s.price_is_starting_from)}
                  </Text>
                </View>
              ))}
              <Text size={14} color={colors.muted} style={{ marginTop: 10 }}>
                Ödeme salonda yapılır.
              </Text>
            </Card>
          </Appear>

          {profile.photos.length > 1 ? (
            <Appear index={3}>
              <Card style={{ gap: 12 }}>
                <SectionTitle count={profile.photos.length}>Fotoğraflar</SectionTitle>
                <View style={styles.grid}>
                  {profile.photos.map((p, i) => (
                    <Pressable key={p.id} onPress={() => setViewer(i)} style={({ pressed }) => [styles.gridCell, pressed && { opacity: 0.85 }]} accessibilityLabel={`Fotoğraf ${i + 1}`}>
                      <PhotoTile uri={photoUrl(p.id)} radius={10} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            </Appear>
          ) : null}

          {profile.posts?.length ? (
            <Appear index={4}>
              <Card style={{ gap: 12 }}>
                <SectionTitle>Çalışmalarımız</SectionTitle>
                <View style={styles.posts}>
                  {profile.posts.map((p) => (
                    <View key={p.id} style={{ width: '47.5%' }}>
                      <HaircutCard post={p} liked={liked.has(p.id)} onToggleLike={toggleLike} onPress={() => router.push(`/randevu/${profile.slug}`)} />
                    </View>
                  ))}
                </View>
              </Card>
            </Appear>
          ) : null}

          <Appear index={5}>
            <Card style={{ gap: 2 }}>
              <SectionTitle>Çalışma saatleri</SectionTitle>
              {profile.openingHours.map((h) => {
                const isToday = h.weekday === weekday;
                return (
                  <View key={h.weekday} style={[styles.hourRow, isToday && styles.hourToday]}>
                    <Text weight={isToday ? 'bold' : 'regular'}>
                      {WEEKDAYS[h.weekday - 1]}
                      {isToday ? ' · Bugün' : ''}
                    </Text>
                    <Text weight={isToday ? 'bold' : 'regular'} color={h.open ? colors.ink : colors.muted}>
                      {h.open ? `${h.open}–${h.close}` : 'Kapalı'}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </Appear>

          {profile.staff.length ? (
            <Appear index={6}>
              <Card style={{ gap: 0 }}>
                <SectionTitle>Personel</SectionTitle>
                {profile.staff.map((m, i) => (
                  <View key={m.id} style={[styles.staffRow, i < profile.staff.length - 1 && styles.line]}>
                    <StaffAvatar name={m.display_name} photoId={m.photo_id} size={48} />
                    <Text size={17} weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                      {m.display_name}
                    </Text>
                    <Pressable
                      onPress={() => router.push(`/randevu/${profile.slug}?personel=${m.id}`)}
                      style={({ pressed }) => [styles.staffBook, pressed && { transform: [{ scale: 0.96 }] }]}
                      accessibilityLabel={`${m.display_name} ile randevu al`}
                    >
                      <Text size={15} weight="bold" color={colors.primary}>
                        Randevu al
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            </Appear>
          ) : null}

          {ratings && ratings.count > 0 ? (
            <Appear index={7}>
              <RatingsCard data={ratings} />
            </Appear>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.bookBar, { paddingBottom: insets.bottom + 12 }]}>
        {profile.whatsapp ? <ActionButton icon="whatsapp" label="WhatsApp" onPress={() => Linking.openURL(whatsappUrl(profile.whatsapp!))} /> : null}
        {profile.phone ? <ActionButton icon="phone" label="Ara" onPress={() => Linking.openURL(`tel:${profile.phone}`)} /> : null}
        {directions ? <ActionButton icon="navigate" label="Yol tarifi" onPress={() => Linking.openURL(directions)} /> : null}
        <Button title="Randevu al" onPress={() => router.push(`/randevu/${profile.slug}`)} style={{ flex: 1 }} />
      </View>
      {viewer !== null ? <PhotoCarousel photos={profile.photos} start={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

function SectionTitle({ children, count }: { children: string; count?: number }) {
  return (
    <Text size={20} weight="heavy" style={{ letterSpacing: -0.3, marginBottom: 8 }}>
      {children}
      {count ? <Text size={16} weight="semibold" color={colors.muted}>{`  ${count}`}</Text> : null}
    </Text>
  );
}

function InfoRow(props: { icon: InfoIcon; text: string; hint?: string; onPress?: () => void; action?: { label: string; onPress: () => void } }) {
  const row = (
    <>
      <View style={styles.infoIcon}>
        <Glyph name={props.icon} size={19} color={colors.primary} />
      </View>
      <Text style={{ flex: 1 }}>{props.text}</Text>
      {props.action ? <Button small kind="secondary" title={props.action.label} onPress={props.action.onPress} /> : null}
      {/* "Ara", "Aç": drawn as a button, so it reads as tappable; the whole row is pressable (review, 12 November 2026). */}
      {props.hint ? (
        <View style={styles.infoHint}>
          <Text size={14} weight="bold" color={colors.primary}>
            {props.hint}
          </Text>
        </View>
      ) : null}
    </>
  );
  return props.onPress ? (
    <Pressable onPress={props.onPress} style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.7 }]}>
      {row}
    </Pressable>
  ) : (
    <View style={styles.infoRow}>{row}</View>
  );
}

function ActionButton(props: { icon: InfoIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} accessibilityLabel={props.label} style={({ pressed }) => [styles.action, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Glyph name={props.icon} size={22} color={colors.ink} />
    </Pressable>
  );
}

type InfoIcon = 'pin' | 'phone' | 'whatsapp' | 'instagram' | 'navigate';

/** The website's line icons for the salon's contact rows and action bar. */
function Glyph({ name, size, color }: { name: InfoIcon; size: number; color: string }) {
  if (name === 'pin' || name === 'phone') return <Icon name={name} size={size} color={color} strokeWidth={2} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === 'navigate' ? <Path d="m3 11 18-8-8 18-2-8z" /> : null}
      {name === 'instagram' ? (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={5} />
          <Circle cx={12} cy={12} r={4} />
          <Circle cx={17.5} cy={6.5} r={1} fill={color} />
        </>
      ) : null}
      {name === 'whatsapp' ? (
        <>
          <Path d="M3.5 20.5 5 16.2A8.5 8.5 0 1 1 8.3 19.4z" />
          <Path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2-1-1 .8a5 5 0 0 1-2.7-2.7l.8-1-1-2z" />
        </>
      ) : null}
    </Svg>
  );
}

/** Değerlendirmeler on the salon page (as on the website): the average from the third customer, then each rating with the salon's reply. */
function RatingsCard({ data }: { data: RatingsSummary }) {
  const max = Math.max(1, ...data.distribution);
  const day = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle>Değerlendirmeler</SectionTitle>
      {data.rating != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 4, minWidth: 90 }}>
            <Text size={36} weight="heavy">
              {formatRating(data.rating)}
            </Text>
            <StarRow value={Math.round(data.rating)} size={15} />
            <Text size={13} color={colors.muted}>
              {data.count} müşteri
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {data.distribution.map((n, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text size={13} color={colors.muted} style={{ width: 12 }}>
                  {5 - i}
                </Text>
                <View style={styles.track}>{n > 0 ? <View style={[styles.fill, { width: `${(n / max) * 100}%` }]} /> : null}</View>
                <Text size={13} color={colors.muted} style={{ width: 20, textAlign: 'right' }}>
                  {n}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text color={colors.muted}>Ortalama, 3 müşteri değerlendirdikten sonra gösterilir.</Text>
      )}
      {data.ratings.map((r) => (
        <View key={r.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StarRow value={r.stars} size={15} />
            <Text size={13} color={colors.muted}>
              {r.customer} · {day(r.updated_at)}
            </Text>
          </View>
          {r.reply ? (
            <View style={styles.reply}>
              <Text size={14}>
                <Text size={14} weight="bold">
                  Salonun yanıtı:{' '}
                </Text>
                {r.reply}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
      <Text size={13} color={colors.muted}>
        Yalnızca bu salonda randevusu tamamlanan müşteriler puan verebilir.
      </Text>
    </Card>
  );
}

/** Full-screen photos, swiped left and right, opened from the grid. */
const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/^\+/, '')}`;

const styles = themed(() =>
  StyleSheet.create({
    floatingBack: { position: 'absolute', left: 14, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.float, alignItems: 'center', justifyContent: 'center' },
    heart: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    heartOn: { borderColor: colors.heartLine, backgroundColor: colors.heartSoft },
    today: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, marginTop: 4 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
    infoHint: {
      minWidth: 56,
      minHeight: 38,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    infoIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    line: { borderBottomWidth: 1, borderBottomColor: colors.line },
    serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10 },
    hourToday: { backgroundColor: colors.primarySoft },
    staffRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    staffBook: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    gridCell: { width: '31.5%' },
    posts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.star },
    reply: { padding: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
    bookBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    action: { width: 52, height: 50, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  }),
);
