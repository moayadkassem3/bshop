import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { API_URL } from '@/lib/api';
import { formatDistance } from '@/lib/format';
import { colors, radius, themed } from '@/lib/theme';
import { AUDIENCE } from '@/lib/types';
import { Card, Text } from './ui';

type Salon = {
  slug: string;
  name: string;
  district: string | null;
  city: string | null;
  audience: string;
  verified?: boolean;
  cover_photo_id: string | null;
  rating?: number | null;
  rating_count?: number;
  distance_m?: number;
};

export const photoUrl = (id: string) => `${API_URL}/public/photos/${id}`;

/** A salon in a list: cover photo, name, rating, type and place, distance. */
export function SalonCard({ salon: s, source = 'diger' }: { salon: Salon; source?: 'kesfet' | 'diger' }) {
  return (
    <Card onPress={() => router.push(`/salon/${s.slug}?kaynak=${source}`)} style={styles.card}>
      {s.cover_photo_id ? (
        <Image source={{ uri: photoUrl(s.cover_photo_id) }} style={styles.thumb} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.thumb, styles.initial]}>
          <Text size={22} weight="heavy" color={colors.primary}>
            {s.name[0]}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="bold" size={16} numberOfLines={1}>
          {s.name}
          {s.verified ? <Text color={colors.primary}> ✓</Text> : null}
        </Text>
        <Text size={13} color={colors.muted} numberOfLines={1}>
          {s.rating != null ? `★ ${s.rating.toLocaleString('tr-TR', { minimumFractionDigits: 1 })} (${s.rating_count}) · ` : ''}
          {AUDIENCE[s.audience] ?? 'Kuaför'}
          {[s.district, s.city].filter(Boolean).length ? ` · ${[s.district, s.city].filter(Boolean).join(', ')}` : ''}
        </Text>
      </View>
      {s.distance_m != null ? (
        <Text size={13} weight="semibold" color={colors.ink2}>
          {formatDistance(s.distance_m)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    thumb: { width: 56, height: 56, borderRadius: radius.sm },
    initial: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  }),
);
