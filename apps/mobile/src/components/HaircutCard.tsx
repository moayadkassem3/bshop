import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { API_URL } from '@/lib/api';
import { colors, radius } from '@/lib/theme';
import type { HaircutPost, PopularPost } from '@/lib/types';
import { PhotoTile } from './PhotoTile';
import { Text } from './ui';

export const haircutPhotoUrl = (id: string) => `${API_URL}/public/haircut-photos/${id}`;

/**
 * One haircut photo (as on the website): the style on the photo, the salon (in
 * Popüler kesimler) or the caption (on the salon's own page), and a like button.
 */
export function HaircutCard(props: { post: HaircutPost | PopularPost; liked: boolean; onToggleLike: (id: string) => Promise<boolean | null>; onPress: () => void }) {
  const { post } = props;
  const shop = 'shop_name' in post ? post : null;
  // The count moves with the customer's own like, before the server answers.
  const [delta, setDelta] = useState(0);
  async function like() {
    Haptics.selectionAsync().catch(() => undefined);
    const result = await props.onToggleLike(post.id);
    if (result !== null) setDelta((d) => d + (result ? 1 : -1));
  }
  return (
    <View style={styles.card}>
      <Pressable onPress={props.onPress} style={({ pressed }) => pressed && { opacity: 0.9 }} accessibilityLabel={shop ? `${post.style_name}, ${shop.shop_name}` : post.style_name}>
        <PhotoTile uri={haircutPhotoUrl(post.id)} ratio={5 / 4}>
          <View style={styles.tag}>
            <Text size={12} weight="bold" color={colors.white} numberOfLines={1}>
              {post.style_name}
            </Text>
          </View>
        </PhotoTile>
      </Pressable>
      <View style={styles.footer}>
        <Pressable onPress={props.onPress} style={{ flex: 1, minWidth: 0 }}>
          {shop ? (
            <>
              <Text size={13} weight="bold" numberOfLines={1}>
                {shop.shop_name}
                {shop.shop_verified ? (
                  <Text size={13} color={colors.primary}>
                    {' '}
                    ✓
                  </Text>
                ) : null}
              </Text>
              {shop.district || shop.city ? (
                <Text size={12} color={colors.muted} numberOfLines={1}>
                  {shop.district || shop.city}
                </Text>
              ) : null}
            </>
          ) : (
            <Text size={13} color={colors.ink2} numberOfLines={1}>
              {post.caption ?? ''}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => void like()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: props.liked }}
          accessibilityLabel={props.liked ? 'Beğeniyi geri al' : 'Beğen'}
          style={styles.like}
        >
          <Svg width={17} height={17} viewBox="0 0 24 24" fill={props.liked ? colors.danger : 'none'} stroke={props.liked ? colors.danger : colors.ink2} strokeWidth={2} strokeLinejoin="round">
            <Path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.2 1.1 3.9 2.2.4.6 1 .6 1.4 0C12.4 6.1 13.6 5 15.6 5 19 5 20.7 8.4 19.2 11.4 17 15.6 12 20 12 20z" />
          </Svg>
          <Text size={13} weight="semibold" color={props.liked ? colors.danger : colors.ink2}>
            {Math.max(0, post.like_count + delta)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tag: { position: 'absolute', left: 8, bottom: 8, maxWidth: '85%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(11,17,32,0.7)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
});
