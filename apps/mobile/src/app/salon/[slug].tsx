import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Appear, PageSkeleton } from '@/components/motion';
import { photoUrl } from '@/components/SalonCard';
import { Alert, Button, Card, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { AUDIENCE, type ShopProfile } from '@/lib/types';

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const width = Dimensions.get('window').width;

/** Weekday in Türkiye, 1 = Monday … 7 = Sunday. */
function turkeyWeekday(): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

/** A salon's page (as on the website): photos, details, services, staff and hours. */
export default function SalonScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setProfile(await api<ShopProfile>(`/public/shops/${slug}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [slug]);

  useEffect(() => {
    load();
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

  const today = profile.openingHours.find((h) => h.weekday === turkeyWeekday());
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
            {profile.photos.map((p) => (
              <Image key={p.id} source={{ uri: photoUrl(p.id) }} style={{ width, height: width * 0.75 }} contentFit="cover" transition={150} />
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: insets.top + 56, backgroundColor: colors.ink }} />
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
                  <Icon name="favoriler" size={22} color={favorite ? '#d1344a' : colors.ink} />
                </Pressable>
              </View>
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

          <Appear index={1}>
            <Card style={{ gap: 12 }}>
              <Text size={17} weight="bold">
                Salon bilgileri
              </Text>
              {profile.address ? <InfoRow icon="pin" text={profile.address} action={directions ? { label: 'Yol tarifi', onPress: () => Linking.openURL(directions) } : undefined} /> : null}
              {profile.phone ? <InfoRow icon="phone" text={formatPhone(profile.phone)} action={{ label: 'Ara', onPress: () => Linking.openURL(`tel:${profile.phone}`) }} /> : null}
              {profile.whatsapp ? <InfoRow icon="phone" text="WhatsApp" action={{ label: 'Yaz', onPress: () => Linking.openURL(`https://wa.me/${profile.whatsapp!.replace(/^\+/, '')}`) }} /> : null}
            </Card>
          </Appear>

          <Appear index={2}>
            <Card style={{ gap: 10 }}>
              <Text size={17} weight="bold">
                Hizmetler
              </Text>
              {profile.services.map((s) => (
                <View key={s.id} style={styles.serviceRow}>
                  <View style={{ flex: 1 }}>
                    <Text weight="semibold">{s.name}</Text>
                    <Text size={13} color={colors.muted}>
                      {s.duration_minutes} dk
                    </Text>
                  </View>
                  <Text weight="bold">{formatPrice(s.price_kurus, s.price_is_starting_from)}</Text>
                </View>
              ))}
            </Card>
          </Appear>

          {profile.staff.length ? (
            <Appear index={3}>
              <Card style={{ gap: 10 }}>
                <Text size={17} weight="bold">
                  Personel
                </Text>
                <Text color={colors.ink2}>{profile.staff.map((m) => m.display_name).join(' · ')}</Text>
              </Card>
            </Appear>
          ) : null}

          <Appear index={4}>
            <Card style={{ gap: 6 }}>
              <Text size={17} weight="bold">
                Çalışma saatleri
              </Text>
              {profile.openingHours.map((h) => (
                <View key={h.weekday} style={styles.hourRow}>
                  <Text weight={h.weekday === turkeyWeekday() ? 'bold' : 'regular'}>{WEEKDAYS[h.weekday - 1]}</Text>
                  <Text weight={h.weekday === turkeyWeekday() ? 'bold' : 'regular'} color={h.open ? colors.ink : colors.muted}>
                    {h.open ? `${h.open}–${h.close}` : 'Kapalı'}
                  </Text>
                </View>
              ))}
            </Card>
          </Appear>
        </View>
      </ScrollView>
      <View style={[styles.bookBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button title="Randevu al" onPress={() => router.push(`/randevu/${profile.slug}`)} />
      </View>
    </View>
  );
}

function InfoRow(props: { icon: 'pin' | 'phone'; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={styles.infoIcon}>
        <Icon name={props.icon} size={18} color={colors.primary} />
      </View>
      <Text style={{ flex: 1 }}>{props.text}</Text>
      {props.action ? <Button small kind="secondary" title={props.action.label} onPress={props.action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingBack: { position: 'absolute', left: 14, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heart: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  heartOn: { borderColor: '#f4c7cf', backgroundColor: '#fdf0f2' },
  today: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, marginTop: 4 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bookBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
});
