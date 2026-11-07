import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { api } from '@/lib/api';
import { colors, radius } from '@/lib/theme';
import type { PopularPost } from '@/lib/types';
import { haircutPhotoUrl } from './HaircutCard';
import { Text } from './ui';

/**
 * "Popüler kesimler" as a sideways row at the bottom of Favoriler (as on the
 * website); each photo opens the salon that made it, Tümü opens the full list.
 * Follows the customer's Erkek/Kadın choice; hidden until there are posts.
 */
export function PopularStrip({ audience }: { audience: 'men' | 'women' | 'all' }) {
  const [posts, setPosts] = useState<PopularPost[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ limit: '12' });
    if (audience !== 'all') params.set('audience', audience);
    api<PopularPost[]>(`/public/haircuts?${params}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [audience]);

  if (!posts.length) return null;
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <View style={styles.head}>
        <Text size={20} weight="heavy">
          Popüler kesimler
        </Text>
        <Pressable onPress={() => router.push('/kesimler')} hitSlop={10}>
          <Text weight="bold" color={colors.primary}>
            Tümü ›
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 6 }} />
        {posts.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/salon/${p.shop_slug}`)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.9 }]}
            accessibilityLabel={`${p.style_name}, ${p.shop_name}`}
          >
            <Image source={{ uri: haircutPhotoUrl(p.id) }} style={styles.photo} contentFit="cover" transition={150} />
            <View style={styles.caption}>
              <Text size={12} weight="bold" color={colors.white} numberOfLines={1}>
                {p.style_name}
              </Text>
              <Text size={11} color="rgba(255,255,255,0.85)" numberOfLines={1}>
                {p.shop_name}
                {p.shop_verified ? ' ✓' : ''}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={{ width: 6 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { width: 132, height: 176, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
  photo: { width: 132, height: 176 },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: 'rgba(11,17,32,0.62)' },
});
